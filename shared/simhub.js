// SimHub (via le plugin « SimHub Property Server ») : propriétés courantes et
// préréglages de la bibliothèque. Les noms suivent la convention du plugin :
// « dcp.gd.X » = DataCorePlugin.GameData.X ; les autres propriétés SimHub
// s'utilisent avec leur nom complet (ex. « DataCorePlugin.GameData.TyrePressureFrontLeft »).

export const SIMHUB_PROPERTIES = [
  ['dcp.GameRunning', 'Jeu en cours'],
  ['dcp.GameName', 'Nom du jeu'],
  ['dcp.GamePaused', 'Jeu en pause'],
  ['dcp.gd.SpeedKmh', 'Vitesse (km/h)'],
  ['dcp.gd.SpeedLocal', 'Vitesse (unité du jeu)'],
  ['dcp.gd.Gear', 'Rapport engagé'],
  ['dcp.gd.Rpms', 'Régime moteur'],
  ['dcp.gd.FilteredRpms', 'Régime moteur (filtré)'],
  ['dcp.gd.MaxRpm', 'Régime maximal'],
  ['dcp.gd.Fuel', 'Carburant'],
  ['dcp.gd.FuelPercent', 'Carburant (%)'],
  ['dcp.gd.Position', 'Position'],
  ['dcp.gd.CompletedLaps', 'Tours effectués'],
  ['dcp.gd.CurrentLapTime', 'Tour en cours'],
  ['dcp.gd.LastLapTime', 'Dernier tour'],
  ['dcp.gd.BestLapTime', 'Meilleur tour'],
  ['dcp.gd.TCLevel', 'Antipatinage : niveau'],
  ['dcp.gd.TCActive', 'Antipatinage : actif'],
  ['dcp.gd.ABSLevel', 'ABS : niveau'],
  ['dcp.gd.ABSActive', 'ABS : actif'],
  ['dcp.gd.BrakeBias', 'Répartition de freinage'],
  ['dcp.gd.PitLimiterOn', 'Limiteur de stand'],
  ['dcp.gd.IsInPit', 'Aux stands'],
  ['dcp.gd.IsInPitLane', 'Dans la voie des stands'],
  ['dcp.gd.EngineIgnitionOn', 'Contact mis'],
  ['dcp.gd.DRSAvailable', 'DRS disponible'],
  ['dcp.gd.DRSEnabled', 'DRS ouvert'],
  ['dcp.gd.AirTemperature', 'Température de l’air'],
  ['dcp.gd.RoadTemperature', 'Température de la piste'],
  ['dcp.gd.WaterTemperature', 'Température d’eau'],
  ['dcp.gd.OilTemperature', 'Température d’huile'],
];

/** Nom de propriété acceptable (le protocole est découpé sur les espaces). */
export const isValidSimhubProp = (name) => /^[^\s]+$/.test(String(name ?? ''));

const display = (label, simhub, title, opts = {}) => ({
  label,
  desc: 'SimHub · afficheur',
  action: { type: 'display', display: { simhub, decimals: 0, ...opts }, press: null },
  face: { title, icon: null, color: '#111827' },
});

const syncedToggle = (label, simhub, title, onTitle, onColor = '#15803d') => ({
  label,
  desc: 'SimHub · état synchronisé',
  action: {
    type: 'toggle',
    same: true,
    sync: { simhub },
    actions: [
      { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
      { type: 'hotkey', hotkey: { modifiers: [], key: '' }, target: { by: 'none', value: '' } },
    ],
  },
  face: { title, icon: null, color: '#1f2937' },
  alt: { title: onTitle, icon: null, color: onColor },
});

export const SIMHUB_PRESETS = [
  display('Vitesse', 'dcp.gd.SpeedKmh', 'km/h'),
  display('Rapport engagé', 'dcp.gd.Gear', 'Rapport'),
  display('Régime moteur', 'dcp.gd.Rpms', 'tr/min'),
  display('Carburant', 'dcp.gd.Fuel', 'Carburant', { decimals: 1, suffix: ' L' }),
  display('Carburant (%)', 'dcp.gd.FuelPercent', 'Carburant', { suffix: ' %' }),
  display('Position', 'dcp.gd.Position', 'Position'),
  display('Tours effectués', 'dcp.gd.CompletedLaps', 'Tours'),
  display('Tour en cours', 'dcp.gd.CurrentLapTime', 'Tour', { time: true, decimals: 1 }),
  display('Dernier tour', 'dcp.gd.LastLapTime', 'Dernier', { time: true, decimals: 3 }),
  display('Meilleur tour', 'dcp.gd.BestLapTime', 'Meilleur', { time: true, decimals: 3 }),
  display('Antipatinage (niveau)', 'dcp.gd.TCLevel', 'TC'),
  display('ABS (niveau)', 'dcp.gd.ABSLevel', 'ABS'),
  display('Répartition de freinage', 'dcp.gd.BrakeBias', 'Frein AV', { decimals: 1, suffix: ' %' }),
  syncedToggle('Limiteur de stand', 'dcp.gd.PitLimiterOn', 'Limiteur', 'LIMITEUR', '#ca8a04'),
  syncedToggle('Contact', 'dcp.gd.EngineIgnitionOn', 'Contact', 'CONTACT'),
  syncedToggle('DRS', 'dcp.gd.DRSEnabled', 'DRS', 'DRS OUVERT'),
];
