# Agent d'entrée Windows pour StreamSim.
# Processus persistant : lit une commande JSON par ligne sur stdin et répond
# une ligne JSON sur stdout. Garder le processus vivant évite ~300 ms de
# démarrage PowerShell à chaque appui de touche.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class DeckInput {
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion U; }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    static INPUT Key(ushort vk, ushort scan, uint flags) {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.U.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero };
        return i;
    }

    static void Send(List<INPUT> inputs) {
        if (inputs.Count == 0) return;
        uint sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
        if (sent != inputs.Count) throw new Exception("SendInput a échoué (code " + Marshal.GetLastWin32Error() + ")");
    }

    // keys : liste [vk, extended] ; tout est enfoncé dans l'ordre puis relâché en sens inverse.
    public static void Chord(int[] vks, bool[] ext) {
        List<INPUT> list = new List<INPUT>();
        for (int i = 0; i < vks.Length; i++)
            list.Add(Key((ushort)vks[i], 0, ext[i] ? KEYEVENTF_EXTENDEDKEY : 0));
        for (int i = vks.Length - 1; i >= 0; i--)
            list.Add(Key((ushort)vks[i], 0, (ext[i] ? KEYEVENTF_EXTENDEDKEY : 0) | KEYEVENTF_KEYUP));
        Send(list);
    }

    public static void Type(string text) {
        List<INPUT> list = new List<INPUT>();
        foreach (char c in text.Replace("\r\n", "\n")) {
            if (c == '\n') {
                list.Add(Key(0x0D, 0, 0));
                list.Add(Key(0x0D, 0, KEYEVENTF_KEYUP));
                continue;
            }
            list.Add(Key(0, c, KEYEVENTF_UNICODE));
            list.Add(Key(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
        }
        Send(list);
    }

    public static bool Focus(IntPtr hwnd) {
        if (hwnd == IntPtr.Zero) return false;
        if (IsIconic(hwnd)) ShowWindow(hwnd, 9); // SW_RESTORE
        IntPtr fg = GetForegroundWindow();
        uint dummy;
        uint fgThread = GetWindowThreadProcessId(fg, out dummy);
        uint me = GetCurrentThreadId();
        // Windows limite SetForegroundWindow : on s'attache au thread de la
        // fenêtre active et on simule un appui Alt pour lever la restriction.
        bool attached = fgThread != me && AttachThreadInput(me, fgThread, true);
        try {
            SetForegroundWindow(hwnd);
            if (GetForegroundWindow() != hwnd) {
                Chord(new int[] { 0x12 }, new bool[] { false });
                SetForegroundWindow(hwnd);
            }
            return GetForegroundWindow() == hwnd;
        } finally {
            if (attached) AttachThreadInput(me, fgThread, false);
        }
    }
}
'@

function Find-Window($by, $value) {
    $needle = $value.ToLowerInvariant()
    $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
    if ($by -eq 'title') {
        return $procs | Where-Object { $_.MainWindowTitle.ToLowerInvariant().Contains($needle) } | Select-Object -First 1
    }
    $name = $needle -replace '\.exe$', ''
    return $procs | Where-Object { $_.ProcessName.ToLowerInvariant() -eq $name } | Select-Object -First 1
}

function Invoke-DeckCommand($cmd) {
    switch ($cmd.op) {
        'ping' { return @{ pong = $true } }
        'chord' {
            [int[]]$vks = @($cmd.seq | ForEach-Object { [int]$_[0] })
            [bool[]]$ext = @($cmd.seq | ForEach-Object { [bool]$_[1] })
            [DeckInput]::Chord($vks, $ext)
            return @{}
        }
        'text' { [DeckInput]::Type([string]$cmd.text); return @{} }
        'focus' {
            $p = Find-Window $cmd.by $cmd.value
            if (-not $p) { throw "Application introuvable : $($cmd.value)" }
            [void][DeckInput]::Focus($p.MainWindowHandle)
            return @{ process = $p.ProcessName }
        }
        'launch' {
            $params = @{ FilePath = [string]$cmd.path }
            if ($cmd.args) { $params.ArgumentList = [string]$cmd.args }
            if ($cmd.cwd) { $params.WorkingDirectory = [string]$cmd.cwd }
            Start-Process @params
            return @{}
        }
        'windows' {
            $list = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle } |
                ForEach-Object { @{ process = $_.ProcessName; title = $_.MainWindowTitle } }
            return @{ windows = @($list) }
        }
        default { throw "Opération inconnue : $($cmd.op)" }
    }
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if (-not $line.Trim()) { continue }
    $id = $null
    try {
        $cmd = $line | ConvertFrom-Json
        $id = $cmd.id
        $result = Invoke-DeckCommand $cmd
        $result.id = $id
        $result.ok = $true
    } catch {
        $result = @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
    [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
}
