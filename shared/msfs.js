// Catalogue Microsoft Flight Simulator (2020 / 2024) via SimConnect.
// Les « événements » sont les commandes standard du simulateur (Event IDs) ;
// les « variables » (SimVars) permettent d'afficher l'état réel sur les touches à bascule.
// Certains avions très détaillés (Fenix, PMDG, FBW…) ont leurs propres systèmes et
// peuvent ignorer une partie de ces commandes standard.

export const MSFS_EVENTS = [
  { group: 'Train & freins', items: [
    ['GEAR_TOGGLE', 'Train d’atterrissage (basculer)'],
    ['GEAR_UP', 'Rentrer le train'],
    ['GEAR_DOWN', 'Sortir le train'],
    ['PARKING_BRAKES', 'Frein de parc (basculer)'],
    ['SPOILERS_TOGGLE', 'Aérofreins (basculer)'],
    ['SPOILERS_ARM_TOGGLE', 'Armer les spoilers (basculer)'],
  ] },
  { group: 'Volets & compensation', items: [
    ['FLAPS_INCR', 'Volets : un cran de plus'],
    ['FLAPS_DECR', 'Volets : un cran de moins'],
    ['FLAPS_UP', 'Volets rentrés'],
    ['FLAPS_DOWN', 'Volets sortis en grand'],
    ['ELEV_TRIM_UP', 'Compensateur : cabrer'],
    ['ELEV_TRIM_DN', 'Compensateur : piquer'],
  ] },
  { group: 'Feux', items: [
    ['LANDING_LIGHTS_TOGGLE', 'Feux d’atterrissage'],
    ['TOGGLE_TAXI_LIGHTS', 'Feux de roulage'],
    ['TOGGLE_NAV_LIGHTS', 'Feux de navigation'],
    ['TOGGLE_BEACON_LIGHTS', 'Anticollision (beacon)'],
    ['STROBES_TOGGLE', 'Feux à éclats (strobes)'],
    ['TOGGLE_LOGO_LIGHTS', 'Éclairage du logo'],
    ['TOGGLE_WING_LIGHTS', 'Éclairage des ailes'],
    ['PANEL_LIGHTS_TOGGLE', 'Éclairage du tableau de bord'],
  ] },
  { group: 'Pilote automatique', items: [
    ['AP_MASTER', 'Pilote automatique (AP)'],
    ['TOGGLE_FLIGHT_DIRECTOR', 'Directeur de vol (FD)'],
    ['AP_HDG_HOLD', 'Tenue de cap (HDG)'],
    ['AP_ALT_HOLD', 'Tenue d’altitude (ALT)'],
    ['AP_VS_HOLD', 'Vitesse verticale (VS)'],
    ['AP_NAV1_HOLD', 'Navigation (NAV)'],
    ['AP_APR_HOLD', 'Approche (APR)'],
    ['AUTO_THROTTLE_ARM', 'Auto-manette (A/THR)'],
    ['HEADING_BUG_INC', 'Cap sélecté +1°'],
    ['HEADING_BUG_DEC', 'Cap sélecté −1°'],
    ['AP_ALT_VAR_INC', 'Altitude sélectée +'],
    ['AP_ALT_VAR_DEC', 'Altitude sélectée −'],
    ['AP_VS_VAR_INC', 'Vitesse verticale +'],
    ['AP_VS_VAR_DEC', 'Vitesse verticale −'],
    ['AP_AIRSPEED_HOLD', 'Tenue de vitesse (SPD)'],
    ['AP_SPD_VAR_INC', 'Vitesse sélectée +'],
    ['AP_SPD_VAR_DEC', 'Vitesse sélectée −'],
  ] },
  { group: 'Systèmes', items: [
    ['TOGGLE_MASTER_BATTERY', 'Batterie principale'],
    ['TOGGLE_MASTER_ALTERNATOR', 'Alternateur'],
    ['TOGGLE_AVIONICS_MASTER', 'Avionique'],
    ['PITOT_HEAT_TOGGLE', 'Réchauffage pitot'],
    ['ANTI_ICE_TOGGLE', 'Antigivrage'],
    ['TOGGLE_FUEL_PUMP', 'Pompe carburant'],
    ['CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE', 'Consigne ceintures'],
    ['ENGINE_AUTO_START', 'Démarrage auto des moteurs'],
    ['ENGINE_AUTO_SHUTDOWN', 'Arrêt auto des moteurs'],
  ] },
  { group: 'Radio & instruments', items: [
    ['COM_STBY_RADIO_SWAP', 'COM1 : permuter active / attente'],
    ['NAV1_RADIO_SWAP', 'NAV1 : permuter active / attente'],
    ['XPNDR_IDENT_ON', 'Transpondeur : IDENT'],
    ['BAROMETRIC', 'Altimètre : caler la pression locale'],
    ['KOHLSMAN_INC', 'Altimètre : calage +'],
    ['KOHLSMAN_DEC', 'Altimètre : calage −'],
    ['VOR1_OBI_INC', 'Course VOR1 (CRS) +1°'],
    ['VOR1_OBI_DEC', 'Course VOR1 (CRS) −1°'],
  ] },
  { group: 'Axes (curseurs)', items: [
    ['THROTTLE_SET', 'Manette des gaz (tous moteurs)'],
    ['FLAPS_SET', 'Volets (position)'],
    ['SPOILERS_SET', 'Aérofreins (position)'],
    ['MIXTURE_SET', 'Mélange (tous moteurs)'],
    ['PROP_PITCH_SET', 'Pas d’hélice (tous moteurs)'],
    ['ELEVATOR_TRIM_SET', 'Compensateur de profondeur (position)'],
  ] },
  { group: 'Simulation', items: [
    ['PAUSE_TOGGLE', 'Pause'],
    ['TOGGLE_PUSHBACK', 'Repoussage (pushback)'],
    ['TOGGLE_AIRCRAFT_EXIT', 'Porte principale'],
    ['VIEW_MODE', 'Changer de vue'],
  ] },
];

export const MSFS_EVENT_LABELS = Object.fromEntries(MSFS_EVENTS.flatMap((g) => g.items));

// Variables utilisables pour l'état d'une bascule (valeur non nulle = état 2).
export const MSFS_SIMVARS = [
  ['GEAR HANDLE POSITION', 'Levier de train sorti'],
  ['BRAKE PARKING POSITION', 'Frein de parc serré'],
  ['SPOILERS ARMED', 'Spoilers armés'],
  ['LIGHT LANDING', 'Feux d’atterrissage'],
  ['LIGHT TAXI', 'Feux de roulage'],
  ['LIGHT NAV', 'Feux de navigation'],
  ['LIGHT BEACON', 'Anticollision'],
  ['LIGHT STROBE', 'Feux à éclats'],
  ['LIGHT LOGO', 'Éclairage du logo'],
  ['LIGHT WING', 'Éclairage des ailes'],
  ['LIGHT PANEL', 'Éclairage du tableau de bord'],
  ['AUTOPILOT MASTER', 'Pilote automatique'],
  ['AUTOPILOT FLIGHT DIRECTOR ACTIVE', 'Directeur de vol'],
  ['AUTOPILOT HEADING LOCK', 'Mode HDG'],
  ['AUTOPILOT ALTITUDE LOCK', 'Mode ALT'],
  ['AUTOPILOT VERTICAL HOLD', 'Mode VS'],
  ['AUTOPILOT NAV1 LOCK', 'Mode NAV'],
  ['AUTOPILOT APPROACH HOLD', 'Mode APR'],
  ['AUTOPILOT THROTTLE ARM', 'Auto-manette armée'],
  ['ELECTRICAL MASTER BATTERY', 'Batterie'],
  ['GENERAL ENG MASTER ALTERNATOR:1', 'Alternateur'],
  ['AVIONICS MASTER SWITCH', 'Avionique'],
  ['PITOT HEAT', 'Réchauffage pitot'],
  ['STRUCTURAL DEICE SWITCH', 'Antigivrage'],
  ['GENERAL ENG FUEL PUMP SWITCH:1', 'Pompe carburant'],
  ['CABIN SEATBELTS ALERT SWITCH', 'Consigne ceintures'],
];

export const isValidEventName = (name) => /^[A-Z0-9_.#-]{2,64}$/.test(String(name || ''));

// Variables : SimVars standard (« GEAR HANDLE POSITION », « NAV OBS:1 ») ou variables
// locales propres à un avion, préfixées « L: » (ex. « L:A32NX_FCU_AP_1_LIGHT_ON »).
export const isLocalVar = (name) => /^L:/i.test(String(name || '').trim());
export const isValidSimvar = (name) => {
  const v = String(name || '').trim();
  return isLocalVar(v) ? /^L:[A-Za-z0-9_.:-]{1,96}$/.test(v) : /^[A-Z0-9 _]{2,64}(:\d{1,2})?$/.test(v);
};
/** Forme canonique : les SimVars standard en majuscules, les variables L: telles quelles. */
export const normalizeVar = (name) => {
  const v = String(name || '').trim();
  return isLocalVar(v) ? `L:${v.slice(2)}` : v.toUpperCase();
};
/** Unité par défaut : « number » pour une variable L:, « Bool » pour un état on/off standard. */
export const defaultUnit = (name, onOff = true) => (isLocalVar(name) ? 'number' : onOff ? 'Bool' : 'number');

export const MSFS_UNITS = ['number', 'Bool', 'percent', 'degrees', 'feet', 'knots', 'feet per minute', 'millibars', 'mach', 'position', 'enum'];

// Noms d'Input Events (MSFS 2024) : lettres, chiffres, « _ », « . », « : ».
export const isValidInputEvent = (name) => /^[A-Za-z0-9_.:#-]{2,128}$/.test(String(name || ''));

const I = (name) => `/public/icons/avia/${name}.svg`;
const toggle = (event, simvar) => ({ type: 'toggle', same: true, sync: { simvar }, actions: [{ type: 'msfs', event }] });
const press = (event) => ({ type: 'msfs', event });

const OFF = '#2b3140';

// Préréglages de la bibliothèque : touches prêtes à l'emploi (action + apparence).
export const MSFS_PRESETS = [
  { label: 'Train d’atterrissage', action: toggle('GEAR_TOGGLE', 'GEAR HANDLE POSITION'),
    face: { title: 'Train rentré', icon: I('gear-up'), color: OFF }, alt: { title: 'Train sorti', icon: I('gear-down'), color: '#15803d' } },
  { label: 'Frein de parc', action: toggle('PARKING_BRAKES', 'BRAKE PARKING POSITION'),
    face: { title: 'Frein libre', icon: I('parking-brake'), color: OFF }, alt: { title: 'Frein serré', icon: I('parking-brake'), color: '#b91c1c' } },
  { label: 'Volets +', action: press('FLAPS_INCR'), face: { title: 'Volets +', icon: I('flaps-down'), color: '#334155' } },
  { label: 'Volets −', action: press('FLAPS_DECR'), face: { title: 'Volets −', icon: I('flaps-up'), color: '#334155' } },
  { label: 'Aérofreins', action: press('SPOILERS_TOGGLE'), face: { title: 'Aérofreins', icon: I('spoilers'), color: '#334155' } },
  { label: 'Spoilers armés', action: toggle('SPOILERS_ARM_TOGGLE', 'SPOILERS ARMED'),
    face: { title: 'Spoilers', icon: I('spoilers'), color: OFF }, alt: { title: 'Spoilers armés', icon: I('spoilers'), color: '#0369a1' } },
  { label: 'Compensateur cabrer', action: press('ELEV_TRIM_UP'), face: { title: 'Trim ↑', icon: I('trim-up'), color: '#334155' } },
  { label: 'Compensateur piquer', action: press('ELEV_TRIM_DN'), face: { title: 'Trim ↓', icon: I('trim-down'), color: '#334155' } },

  { label: 'Feux d’atterrissage', action: toggle('LANDING_LIGHTS_TOGGLE', 'LIGHT LANDING'),
    face: { title: 'LAND', icon: I('landing-light'), color: OFF }, alt: { title: 'LAND', icon: I('landing-light'), color: '#ca8a04' } },
  { label: 'Feux de roulage', action: toggle('TOGGLE_TAXI_LIGHTS', 'LIGHT TAXI'),
    face: { title: 'TAXI', icon: I('taxi-light'), color: OFF }, alt: { title: 'TAXI', icon: I('taxi-light'), color: '#ca8a04' } },
  { label: 'Feux de navigation', action: toggle('TOGGLE_NAV_LIGHTS', 'LIGHT NAV'),
    face: { title: 'NAV', icon: I('nav-lights'), color: OFF }, alt: { title: 'NAV', icon: I('nav-lights'), color: '#15803d' } },
  { label: 'Anticollision', action: toggle('TOGGLE_BEACON_LIGHTS', 'LIGHT BEACON'),
    face: { title: 'BEACON', icon: I('beacon'), color: OFF }, alt: { title: 'BEACON', icon: I('beacon'), color: '#b91c1c' } },
  { label: 'Feux à éclats', action: toggle('STROBES_TOGGLE', 'LIGHT STROBE'),
    face: { title: 'STROBE', icon: I('strobe'), color: OFF }, alt: { title: 'STROBE', icon: I('strobe'), color: '#0891b2' } },

  { label: 'Pilote automatique', action: toggle('AP_MASTER', 'AUTOPILOT MASTER'),
    face: { title: '', icon: I('ap'), color: OFF }, alt: { title: '', icon: I('ap'), color: '#15803d' } },
  { label: 'Directeur de vol', action: toggle('TOGGLE_FLIGHT_DIRECTOR', 'AUTOPILOT FLIGHT DIRECTOR ACTIVE'),
    face: { title: '', icon: I('fd'), color: OFF }, alt: { title: '', icon: I('fd'), color: '#15803d' } },
  { label: 'Mode HDG', action: toggle('AP_HDG_HOLD', 'AUTOPILOT HEADING LOCK'),
    face: { title: '', icon: I('hdg'), color: OFF }, alt: { title: '', icon: I('hdg'), color: '#15803d' } },
  { label: 'Mode ALT', action: toggle('AP_ALT_HOLD', 'AUTOPILOT ALTITUDE LOCK'),
    face: { title: '', icon: I('alt'), color: OFF }, alt: { title: '', icon: I('alt'), color: '#15803d' } },
  { label: 'Mode VS', action: toggle('AP_VS_HOLD', 'AUTOPILOT VERTICAL HOLD'),
    face: { title: '', icon: I('vs'), color: OFF }, alt: { title: '', icon: I('vs'), color: '#15803d' } },
  { label: 'Mode NAV', action: toggle('AP_NAV1_HOLD', 'AUTOPILOT NAV1 LOCK'),
    face: { title: '', icon: I('nav'), color: OFF }, alt: { title: '', icon: I('nav'), color: '#15803d' } },
  { label: 'Mode APR', action: toggle('AP_APR_HOLD', 'AUTOPILOT APPROACH HOLD'),
    face: { title: '', icon: I('apr'), color: OFF }, alt: { title: '', icon: I('apr'), color: '#15803d' } },
  { label: 'Auto-manette', action: toggle('AUTO_THROTTLE_ARM', 'AUTOPILOT THROTTLE ARM'),
    face: { title: '', icon: I('athr'), color: OFF }, alt: { title: '', icon: I('athr'), color: '#15803d' } },
  { label: 'Cap +', action: press('HEADING_BUG_INC'), face: { title: 'HDG +', icon: I('knob-right'), color: '#334155' } },
  { label: 'Cap −', action: press('HEADING_BUG_DEC'), face: { title: 'HDG −', icon: I('knob-left'), color: '#334155' } },
  { label: 'Altitude +', action: press('AP_ALT_VAR_INC'), face: { title: 'ALT +', icon: I('knob-right'), color: '#334155' } },
  { label: 'Altitude −', action: press('AP_ALT_VAR_DEC'), face: { title: 'ALT −', icon: I('knob-left'), color: '#334155' } },

  { label: 'Batterie', action: toggle('TOGGLE_MASTER_BATTERY', 'ELECTRICAL MASTER BATTERY'),
    face: { title: 'BAT', icon: I('battery'), color: OFF }, alt: { title: 'BAT', icon: I('battery'), color: '#15803d' } },
  { label: 'Avionique', action: toggle('TOGGLE_AVIONICS_MASTER', 'AVIONICS MASTER SWITCH'),
    face: { title: 'AVIONICS', icon: I('avionics'), color: OFF }, alt: { title: 'AVIONICS', icon: I('avionics'), color: '#15803d' } },
  { label: 'Réchauffage pitot', action: toggle('PITOT_HEAT_TOGGLE', 'PITOT HEAT'),
    face: { title: 'PITOT', icon: I('pitot-heat'), color: OFF }, alt: { title: 'PITOT', icon: I('pitot-heat'), color: '#ea580c' } },
  { label: 'Consigne ceintures', action: toggle('CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE', 'CABIN SEATBELTS ALERT SWITCH'),
    face: { title: 'SEAT BELTS', icon: I('seatbelt'), color: OFF }, alt: { title: 'SEAT BELTS', icon: I('seatbelt'), color: '#ca8a04' } },
  { label: 'Démarrage moteurs', action: press('ENGINE_AUTO_START'), face: { title: 'Démarrage', icon: I('engine'), color: '#15803d' } },
  { label: 'Arrêt moteurs', action: press('ENGINE_AUTO_SHUTDOWN'), face: { title: 'Arrêt', icon: I('engine'), color: '#b91c1c' } },

  { label: 'COM1 : permuter', action: press('COM_STBY_RADIO_SWAP'), face: { title: 'COM1 ⇄', icon: I('radio'), color: '#334155' } },
  { label: 'NAV1 : permuter', action: press('NAV1_RADIO_SWAP'), face: { title: 'NAV1 ⇄', icon: I('radio'), color: '#334155' } },
  { label: 'Altimètre (QNH)', action: press('BAROMETRIC'), face: { title: 'BARO', icon: I('altimeter'), color: '#334155' } },
  { label: 'Pause', action: press('PAUSE_TOGGLE'), face: { title: 'Pause', icon: I('pause'), color: '#334155' } },
  { label: 'Pushback', action: press('TOGGLE_PUSHBACK'), face: { title: 'Pushback', icon: I('pushback'), color: '#334155' } },
  { label: 'Porte principale', action: press('TOGGLE_AIRCRAFT_EXIT'), face: { title: 'Porte', icon: I('door'), color: '#334155' } },
  { label: 'Changer de vue', action: press('VIEW_MODE'), face: { title: 'Vue', icon: I('camera'), color: '#334155' } },
];

// Liste des icônes aviation fournies (public/icons/avia/<nom>.svg).
export const AVIA_ICONS = [
  'gear-down', 'gear-up', 'parking-brake', 'flaps-down', 'flaps-up', 'spoilers', 'trim-up', 'trim-down',
  'landing-light', 'taxi-light', 'nav-lights', 'beacon', 'strobe',
  'ap', 'fd', 'hdg', 'alt', 'vs', 'nav', 'apr', 'athr', 'knob-left', 'knob-right',
  'battery', 'avionics', 'pitot-heat', 'seatbelt', 'engine', 'fuel',
  'radio', 'altimeter', 'pause', 'pushback', 'door', 'camera', 'plane',
];

// Variables numériques utilisables pour l'affichage d'une valeur sur une touche
// ou la position d'un curseur : [variable, unité, libellé, suffixe, décimales].
export const MSFS_NUMERIC_SIMVARS = [
  ['AUTOPILOT HEADING LOCK DIR', 'degrees', 'Cap sélecté', '°', 0],
  ['AUTOPILOT ALTITUDE LOCK VAR', 'feet', 'Altitude sélectée', ' ft', 0],
  ['AUTOPILOT VERTICAL HOLD VAR', 'feet per minute', 'Vitesse verticale sélectée', ' fpm', 0],
  ['AUTOPILOT AIRSPEED HOLD VAR', 'knots', 'Vitesse sélectée', ' kt', 0],
  ['NAV OBS:1', 'degrees', 'Course VOR1', '°', 0],
  ['KOHLSMAN SETTING MB:1', 'millibars', 'Calage altimétrique', ' hPa', 0],
  ['ELEVATOR TRIM PCT', 'percent', 'Compensateur', ' %', 0],
  ['GENERAL ENG THROTTLE LEVER POSITION:1', 'percent', 'Manette des gaz (moteur 1)', ' %', 0],
  ['FLAPS HANDLE PERCENT', 'percent', 'Levier de volets', ' %', 0],
  ['SPOILERS HANDLE POSITION', 'percent', 'Levier d’aérofreins', ' %', 0],
  ['GENERAL ENG MIXTURE LEVER POSITION:1', 'percent', 'Mélange (moteur 1)', ' %', 0],
  ['GENERAL ENG PROPELLER LEVER POSITION:1', 'percent', 'Pas d’hélice (moteur 1)', ' %', 0],
  ['INDICATED ALTITUDE', 'feet', 'Altitude indiquée', ' ft', 0],
  ['AIRSPEED INDICATED', 'knots', 'Vitesse indiquée', ' kt', 0],
  ['HEADING INDICATOR', 'degrees', 'Cap', '°', 0],
];

const dialPreset = (label, inc, dec, press, simvar, title, icon) => {
  const [, unit, , suffix, decimals] = MSFS_NUMERIC_SIMVARS.find(([v]) => v === simvar);
  return {
    label,
    action: {
      type: 'dial',
      sensitivity: 'normal',
      inc: { type: 'msfs', event: inc },
      dec: { type: 'msfs', event: dec },
      press: press ? { type: 'msfs', event: press } : null,
      display: { simvar, unit, suffix, decimals, wrap360: unit === 'degrees' },
    },
    face: { title, icon: `/public/icons/avia/${icon}.svg`, color: '#1e2533' },
  };
};

const sliderPreset = (label, event, simvar, title, icon, min = 0, max = 16383) => ({
  label,
  action: {
    type: 'slider',
    mode: 'value',
    set: { type: 'msfs', event },
    min,
    max,
    sync: { simvar, unit: 'percent', min: min < 0 ? -100 : 0, max: 100 },
    press: null,
  },
  face: { title, icon: `/public/icons/avia/${icon}.svg`, color: '#1e2533', span: { w: 1, h: 3 } },
});

// Boutons rotatifs : tourner = + / −, appuyer = valider (engager le mode, caler…).
export const MSFS_DIAL_PRESETS = [
  dialPreset('Bouton HDG', 'HEADING_BUG_INC', 'HEADING_BUG_DEC', 'AP_HDG_HOLD', 'AUTOPILOT HEADING LOCK DIR', 'HDG', 'hdg'),
  dialPreset('Bouton ALT', 'AP_ALT_VAR_INC', 'AP_ALT_VAR_DEC', 'AP_ALT_HOLD', 'AUTOPILOT ALTITUDE LOCK VAR', 'ALT', 'alt'),
  dialPreset('Molette VS', 'AP_VS_VAR_INC', 'AP_VS_VAR_DEC', 'AP_VS_HOLD', 'AUTOPILOT VERTICAL HOLD VAR', 'VS', 'vs'),
  dialPreset('Bouton SPD', 'AP_SPD_VAR_INC', 'AP_SPD_VAR_DEC', 'AP_AIRSPEED_HOLD', 'AUTOPILOT AIRSPEED HOLD VAR', 'SPD', 'athr'),
  dialPreset('Bouton CRS', 'VOR1_OBI_INC', 'VOR1_OBI_DEC', null, 'NAV OBS:1', 'CRS', 'nav'),
  dialPreset('Bouton BARO', 'KOHLSMAN_INC', 'KOHLSMAN_DEC', 'BAROMETRIC', 'KOHLSMAN SETTING MB:1', 'BARO', 'altimeter'),
  dialPreset('Molette de compensateur', 'ELEV_TRIM_UP', 'ELEV_TRIM_DN', null, 'ELEVATOR TRIM PCT', 'TRIM', 'trim-up'),
];

// Curseurs : position envoyée au simulateur (0 → 16383) et relue pour rester synchronisée.
export const MSFS_SLIDER_PRESETS = [
  sliderPreset('Manette des gaz', 'THROTTLE_SET', 'GENERAL ENG THROTTLE LEVER POSITION:1', 'Gaz', 'engine'),
  sliderPreset('Levier de volets', 'FLAPS_SET', 'FLAPS HANDLE PERCENT', 'Volets', 'flaps-down'),
  sliderPreset('Levier d’aérofreins', 'SPOILERS_SET', 'SPOILERS HANDLE POSITION', 'Aérofreins', 'spoilers'),
  sliderPreset('Mélange', 'MIXTURE_SET', 'GENERAL ENG MIXTURE LEVER POSITION:1', 'Mélange', 'fuel'),
  sliderPreset('Pas d’hélice', 'PROP_PITCH_SET', 'GENERAL ENG PROPELLER LEVER POSITION:1', 'Hélice', 'engine'),
];

// ---------------------------------------------------------------------------
// Airbus A320neo FlyByWire (A32NX)
// Source : documentation officielle FlyByWire (a320-events.md, a320-simvars.md).
// Les commandes du FCU sont des événements personnalisés « A32NX.* » transmis par
// SimConnect ; les voyants et afficheurs sont des variables locales « L:A32NX_* ».
// ---------------------------------------------------------------------------
export const FBW_EVENTS = [
  { group: 'A320 FlyByWire — FCU', items: [
    ['A32NX.FCU_AP_1_PUSH', 'AP1'], ['A32NX.FCU_AP_2_PUSH', 'AP2'], ['A32NX.FCU_ATHR_PUSH', 'A/THR'],
    ['A32NX.FCU_AP_DISCONNECT_PUSH', 'Déconnexion AP (manche)'], ['A32NX.FCU_ATHR_DISCONNECT_PUSH', 'Déconnexion A/THR (manettes)'],
    ['A32NX.FCU_LOC_PUSH', 'LOC'], ['A32NX.FCU_APPR_PUSH', 'APPR'], ['A32NX.FCU_EXPED_PUSH', 'EXPED'],
    ['A32NX.FCU_SPD_INC', 'SPD +'], ['A32NX.FCU_SPD_DEC', 'SPD −'], ['A32NX.FCU_SPD_PUSH', 'SPD : enfoncer (managé)'], ['A32NX.FCU_SPD_PULL', 'SPD : tirer (sélecté)'],
    ['A32NX.FCU_SPD_MACH_TOGGLE_PUSH', 'SPD / MACH'],
    ['A32NX.FCU_HDG_INC', 'HDG +'], ['A32NX.FCU_HDG_DEC', 'HDG −'], ['A32NX.FCU_HDG_PUSH', 'HDG : enfoncer (managé)'], ['A32NX.FCU_HDG_PULL', 'HDG : tirer (sélecté)'],
    ['A32NX.FCU_TRK_FPA_TOGGLE_PUSH', 'HDG-V/S / TRK-FPA'],
    ['A32NX.FCU_ALT_INC', 'ALT +'], ['A32NX.FCU_ALT_DEC', 'ALT −'], ['A32NX.FCU_ALT_PUSH', 'ALT : enfoncer (managé)'], ['A32NX.FCU_ALT_PULL', 'ALT : tirer (sélecté)'],
    ['A32NX.FCU_ALT_INCREMENT_TOGGLE', 'ALT : pas 100 / 1000'],
    ['A32NX.FCU_VS_INC', 'V/S +'], ['A32NX.FCU_VS_DEC', 'V/S −'], ['A32NX.FCU_VS_PUSH', 'V/S : enfoncer (niveler)'], ['A32NX.FCU_VS_PULL', 'V/S : tirer (sélecté)'],
    ['A32NX.FMGC_DIR_TO_TRIGGER', 'DIR TO (mode NAV)'],
  ] },
  { group: 'A320 FlyByWire — EFIS', items: [
    ['A32NX.FCU_EFIS_L_FD_PUSH', 'FD (commandant)'], ['A32NX.FCU_EFIS_L_LS_PUSH', 'LS (commandant)'],
    ['A32NX.FCU_EFIS_L_BARO_INC', 'BARO +'], ['A32NX.FCU_EFIS_L_BARO_DEC', 'BARO −'],
    ['A32NX.FCU_EFIS_L_BARO_PUSH', 'BARO : enfoncer'], ['A32NX.FCU_EFIS_L_BARO_PULL', 'BARO : tirer (STD)'],
    ['A32NX.FCU_EFIS_L_CSTR_PUSH', 'CSTR'], ['A32NX.FCU_EFIS_L_WPT_PUSH', 'WPT'], ['A32NX.FCU_EFIS_L_VORD_PUSH', 'VOR.D'],
    ['A32NX.FCU_EFIS_L_NDB_PUSH', 'NDB'], ['A32NX.FCU_EFIS_L_ARPT_PUSH', 'ARPT'], ['A32NX.EFIS_L_CHRONO_PUSHED', 'CHRONO'],
  ] },
  { group: 'A320 FlyByWire — Auto-freinage', items: [
    ['A32NX.AUTOBRAKE_BUTTON_LO', 'Auto-freinage LO'], ['A32NX.AUTOBRAKE_BUTTON_MED', 'Auto-freinage MED'],
    ['A32NX.AUTOBRAKE_BUTTON_MAX', 'Auto-freinage MAX'], ['A32NX.AUTOBRAKE_SET_DISARM', 'Auto-freinage désarmé'],
  ] },
];
for (const g of FBW_EVENTS) for (const [id, label] of g.items) MSFS_EVENT_LABELS[id] = `A320 — ${label}`;

const FBW = '#1f2a37';
const ON_GREEN = '#15803d';
const fbwLight = (label, event, lightVar, title, { onColor = ON_GREEN, equals } = {}) => ({
  label,
  action: { type: 'toggle', same: true, sync: { simvar: lightVar, ...(equals !== undefined ? { equals } : {}) }, actions: [{ type: 'msfs', event }] },
  face: { title: '', icon: null, color: FBW, titleOnly: title },
  alt: { color: onColor },
});
// Bouton du FCU : tourner = + / −, appui = enfoncer (managé), appui long = tirer (sélecté).
const fbwKnob = (label, name, title, display) => ({
  label,
  action: {
    type: 'dial',
    sensitivity: 'normal',
    inc: { type: 'msfs', event: `A32NX.FCU_${name}_INC` },
    dec: { type: 'msfs', event: `A32NX.FCU_${name}_DEC` },
    press: { type: 'msfs', event: `A32NX.FCU_${name}_PUSH` },
    hold: { type: 'msfs', event: `A32NX.FCU_${name}_PULL` },
    display,
  },
  face: { title, icon: null, color: '#161b24' },
});

export const FBW_PRESETS = [
  fbwKnob('FCU : bouton SPD', 'SPD', 'SPD', {
    simvar: 'L:A32NX_FCU_AFS_DISPLAY_SPD_MACH_VALUE', unit: 'number', decimals: 0, machAuto: true,
    dashes: 'L:A32NX_FCU_AFS_DISPLAY_SPD_MACH_DASHES', managed: 'L:A32NX_FCU_AFS_DISPLAY_SPD_MACH_MANAGED',
  }),
  fbwKnob('FCU : bouton HDG', 'HDG', 'HDG', {
    simvar: 'L:A32NX_FCU_AFS_DISPLAY_HDG_TRK_VALUE', unit: 'number', decimals: 0, pad: 3,
    dashes: 'L:A32NX_FCU_AFS_DISPLAY_HDG_TRK_DASHES', managed: 'L:A32NX_FCU_AFS_DISPLAY_HDG_TRK_MANAGED',
  }),
  fbwKnob('FCU : bouton ALT', 'ALT', 'ALT', {
    simvar: 'L:A32NX_FCU_AFS_DISPLAY_ALT_VALUE', unit: 'number', decimals: 0, pad: 5,
    managed: 'L:A32NX_FCU_AFS_DISPLAY_LVL_CH_MANAGED',
  }),
  fbwKnob('FCU : molette V/S', 'VS', 'V/S', {
    simvar: 'L:A32NX_FCU_AFS_DISPLAY_VS_FPA_VALUE', unit: 'number', decimals: 0, sign: true,
    dashes: 'L:A32NX_FCU_AFS_DISPLAY_VS_FPA_DASHES',
  }),
  {
    label: 'EFIS : bouton BARO',
    action: {
      type: 'dial',
      sensitivity: 'normal',
      inc: { type: 'msfs', event: 'A32NX.FCU_EFIS_L_BARO_INC' },
      dec: { type: 'msfs', event: 'A32NX.FCU_EFIS_L_BARO_DEC' },
      press: { type: 'msfs', event: 'A32NX.FCU_EFIS_L_BARO_PUSH' },
      hold: { type: 'msfs', event: 'A32NX.FCU_EFIS_L_BARO_PULL' },
      display: { simvar: 'L:A32NX_FCU_EFIS_L_DISPLAY_BARO_VALUE', unit: 'number', decimals: 0, stdVar: 'L:A32NX_FCU_EFIS_L_DISPLAY_BARO_MODE' },
    },
    face: { title: 'BARO', icon: null, color: '#161b24' },
  },
  fbwLight('FCU : AP1', 'A32NX.FCU_AP_1_PUSH', 'L:A32NX_FCU_AP_1_LIGHT_ON', 'AP1'),
  fbwLight('FCU : AP2', 'A32NX.FCU_AP_2_PUSH', 'L:A32NX_FCU_AP_2_LIGHT_ON', 'AP2'),
  fbwLight('FCU : A/THR', 'A32NX.FCU_ATHR_PUSH', 'L:A32NX_FCU_ATHR_LIGHT_ON', 'A/THR'),
  fbwLight('FCU : LOC', 'A32NX.FCU_LOC_PUSH', 'L:A32NX_FCU_LOC_LIGHT_ON', 'LOC'),
  fbwLight('FCU : APPR', 'A32NX.FCU_APPR_PUSH', 'L:A32NX_FCU_APPR_LIGHT_ON', 'APPR'),
  fbwLight('FCU : EXPED', 'A32NX.FCU_EXPED_PUSH', 'L:A32NX_FCU_EXPED_LIGHT_ON', 'EXPED'),
  fbwLight('EFIS : FD', 'A32NX.FCU_EFIS_L_FD_PUSH', 'L:A32NX_FCU_EFIS_L_FD_LIGHT_ON', 'FD'),
  fbwLight('EFIS : LS', 'A32NX.FCU_EFIS_L_LS_PUSH', 'L:A32NX_FCU_EFIS_L_LS_LIGHT_ON', 'LS'),
  fbwLight('FCU : pas ALT 100 / 1000', 'A32NX.FCU_ALT_INCREMENT_TOGGLE', 'L:A32NX_FCU_ALT_INCREMENT_1000', 'ALT 1000', { onColor: '#0369a1' }),
  fbwLight('FCU : HDG-V/S / TRK-FPA', 'A32NX.FCU_TRK_FPA_TOGGLE_PUSH', 'L:A32NX_FCU_AFS_DISPLAY_TRK_FPA_MODE', 'TRK FPA', { onColor: '#0369a1' }),
  fbwLight('FCU : SPD / MACH', 'A32NX.FCU_SPD_MACH_TOGGLE_PUSH', 'L:A32NX_FCU_AFS_DISPLAY_MACH_MODE', 'MACH', { onColor: '#0369a1' }),
  fbwLight('Auto-freinage LO', 'A32NX.AUTOBRAKE_BUTTON_LO', 'L:A32NX_AUTOBRAKES_ARMED_MODE', 'LO', { equals: 1 }),
  fbwLight('Auto-freinage MED', 'A32NX.AUTOBRAKE_BUTTON_MED', 'L:A32NX_AUTOBRAKES_ARMED_MODE', 'MED', { equals: 2 }),
  fbwLight('Auto-freinage MAX', 'A32NX.AUTOBRAKE_BUTTON_MAX', 'L:A32NX_AUTOBRAKES_ARMED_MODE', 'MAX', { equals: 3 }),
];
// Les boutons à voyant affichent leur nom en grand, sans icône.
for (const p of FBW_PRESETS) {
  if (p.face.titleOnly) {
    p.face = { title: p.face.titleOnly, icon: null, color: p.face.color };
    p.alt = { ...p.alt, title: p.face.title };
  }
}

// ---------------------------------------------------------------------------
// Rafale (AzurPoly, MSFS 2024). Commandes exposées en Input Events par l'avion :
// essentiellement le sol (train, frein de parc, aérofreins, échelle, GPU, cales,
// caches). Les systèmes du cockpit passent par des variables L: propres à AzurPoly.
// Chaque touche lit l'état réel dans le simulateur (bascule synchronisée).
// ---------------------------------------------------------------------------
const RAF = '#1c2433';
const ON_RED = '#b91c1c';
const ON_AMBER = '#b45309';
const aviaIcon = (name) => `/public/icons/avia/${name}.svg`;
const rafToggle = (label, input, title, onTitle, iconName, { onIcon, onColor = ON_GREEN } = {}) => ({
  label,
  desc: 'Rafale · état synchronisé',
  action: { type: 'toggle', same: true, sync: { input }, actions: [{ type: 'msfs', kind: 'input', input, op: 'toggle' }] },
  face: { title, icon: aviaIcon(iconName), color: RAF },
  alt: { title: onTitle, icon: aviaIcon(onIcon ?? iconName), color: onColor },
});

export const RAFALE_COVERS = [
  'UNKNOWN_CD_AOA_COVERS', 'UNKNOWN_CD_ENGINE_COVER_L', 'UNKNOWN_CD_ENGINE_COVER_R', 'UNKNOWN_CD_FRONT_ANTENNA_COVER',
  'UNKNOWN_CD_OSF_COVER', 'UNKNOWN_CD_PITOT_COVER', 'UNKNOWN_CD_REAR_COVERS', 'UNKNOWN_CD_SPECTRA_COVERS',
];
const setAll = (inputs, value) => ({ type: 'multi', steps: inputs.map((input) => ({ type: 'msfs', kind: 'input', input, op: 'set', value })) });

export const RAFALE_PRESETS = [
  rafToggle('Train d’atterrissage', 'LANDING_GEAR_GEAR', 'Train rentré', 'Train sorti', 'gear-up', { onIcon: 'gear-down' }),
  rafToggle('Frein de parc', 'LANDING_GEAR_PARKINGBRAKE', 'Frein parc', 'FREIN PARC', 'parking-brake', { onColor: ON_RED }),
  rafToggle('Aérofreins', 'AZP_RAF_HANDLING_SPOILERS', 'Aérofreins', 'AÉROFREINS', 'spoilers', { onColor: ON_AMBER }),
  rafToggle('Échelle pilote', 'LADDER_PILOT_LADDER', 'Échelle', 'ÉCHELLE', 'door', { onColor: ON_AMBER }),
  rafToggle('Groupe de parc (GPU)', 'CD_GPU_CD_GPU', 'GPU', 'GPU', 'battery'),
  rafToggle('Prise GPU', 'GPU_PLUG_GPU_PLUG', 'Prise GPU', 'GPU BRANCHÉ', 'battery'),
  rafToggle('Cales', 'UNKNOWN_CHOCKS', 'Cales', 'CALES', 'pushback', { onColor: ON_AMBER }),
  {
    label: 'Caches et protections (tous)',
    desc: 'Rafale · état synchronisé',
    action: { type: 'toggle', same: false, sync: { input: 'UNKNOWN_CD_PITOT_COVER' }, actions: [setAll(RAFALE_COVERS, 1), setAll(RAFALE_COVERS, 0)] },
    face: { title: 'Caches', icon: aviaIcon('pitot-heat'), color: RAF },
    alt: { title: 'CACHES POSÉS', icon: aviaIcon('pitot-heat'), color: ON_AMBER },
  },
];

// Rafale : systèmes du cockpit, par ses variables L: (relevées dans la fenêtre « Behaviors »
// de MSFS 2024). L'écriture directe de ces variables n'est pas documentée par AzurPoly :
// ces préréglages sont à vérifier dans le simulateur.
const lvar = (name) => `L:${name}`;
const setVar = (name, value) => ({ type: 'msfs', kind: 'var', var: lvar(name), unit: 'number', op: 'set', value });
const rafVar = (label, name, title, onTitle, iconName, { onColor = ON_GREEN } = {}) => ({
  label,
  desc: 'Rafale · variable L: (à vérifier)',
  action: {
    type: 'toggle',
    same: true,
    sync: { simvar: lvar(name), unit: 'number' },
    actions: [{ type: 'msfs', kind: 'var', var: lvar(name), unit: 'number', op: 'toggle' }],
  },
  face: { title, icon: iconName ? aviaIcon(iconName) : null, color: RAF },
  alt: { title: onTitle, icon: iconName ? aviaIcon(iconName) : null, color: onColor },
});
// Bouton poussoir (ex. sélecteurs de page des écrans) : 1 pendant un instant, puis 0.
const rafPush = (label, name, title) => ({
  label,
  desc: 'Rafale · bouton poussoir (à vérifier)',
  action: { type: 'multi', steps: [setVar(name, 1), { type: 'delay', ms: 150 }, setVar(name, 0)] },
  face: { title, icon: null, color: '#161b24' },
});
// Molette 0 à 100 % (luminosité) : tourner = ± 5 %, valeur affichée sur la touche.
const rafDial = (label, name, title) => ({
  label,
  desc: 'Rafale · bouton rotatif (à vérifier)',
  action: {
    type: 'dial',
    sensitivity: 'normal',
    inc: { type: 'msfs', kind: 'var', var: lvar(name), unit: 'number', op: 'add', value: 5, min: 0, max: 100 },
    dec: { type: 'msfs', kind: 'var', var: lvar(name), unit: 'number', op: 'add', value: -5, min: 0, max: 100 },
    press: null,
    display: { simvar: lvar(name), unit: 'number', decimals: 0, suffix: ' %' },
  },
  face: { title, icon: null, color: '#161b24' },
});

export const RAFALE_COCKPIT_PRESETS = [
  rafVar('Batterie', 'AZP_RAF_ELECTRICAL_BATTERY_MASTER_SWITCH_STATE', 'Batterie', 'BATTERIE', 'battery'),
  rafVar('Sécurité armement', 'AZP_RAF_WEAPONS_SAFETY_SWITCH', 'Sécu arme', 'ARME', null, { onColor: ON_RED }),
  rafVar('Laser', 'AZP_RAF_MISC_LASER_SWITCH', 'Laser', 'LASER', null, { onColor: ON_RED }),
  rafVar('Altimètre STD', 'AZP_RAF_ALTIMETER_IS_STD', 'QNH', 'STD', 'altimeter', { onColor: '#0369a1' }),
  rafVar('Dégivrage', 'AZP_RAF_ELECTRICAL_DEICE_SWITCH', 'Dégivrage', 'DÉGIVRAGE', 'pitot-heat'),
  rafVar('Désembuage', 'AZP_RAF_PNEUMATICS_DEFOG_SWITCH', 'Désembuage', 'DÉSEMBUAGE', null),
  rafVar('Prélèvement d’air moteur', 'AZP_RAF_PNEUMATICS_ENGINE_BLEED_AIR_SWITCH', 'Prélèv. air', 'PRÉLÈV. AIR', null),
  rafVar('Direction roue avant (coupure)', 'AZP_RAF_HYDRAULIC_NOSEWHEEL_STEERING_OFF', 'Dir. roue AV', 'DIR. COUPÉE', null, { onColor: ON_AMBER }),
  rafVar('Crosse (secours)', 'AZP_RAF_HYDRAULIC_TAILHOOK_EMERGENCY_SWITCH', 'Crosse', 'CROSSE', null, { onColor: ON_AMBER }),
  rafVar('Tablette EFB', 'AZP_RAF_EFB_ON', 'EFB', 'EFB', null),
  rafPush('VTLG : page gauche', 'AZP_RAF_VTLG_PAGE_SWITCH_L', 'VTLG ◀'),
  rafPush('VTLG : page droite', 'AZP_RAF_VTLG_PAGE_SWITCH_R', 'VTLG ▶'),
  rafPush('VTLG : haut', 'AZP_RAF_VTLG_PAGE_SWITCH_UP', 'VTLG ▲'),
  rafPush('VTLG : bas', 'AZP_RAF_VTLG_PAGE_SWITCH_DN', 'VTLG ▼'),
  rafPush('VTLD : page gauche', 'AZP_RAF_VTLD_PAGE_SWITCH_L', 'VTLD ◀'),
  rafPush('VTLD : page droite', 'AZP_RAF_VTLD_PAGE_SWITCH_R', 'VTLD ▶'),
  rafPush('VTLD : haut', 'AZP_RAF_VTLD_PAGE_SWITCH_UP', 'VTLD ▲'),
  rafPush('VTLD : bas', 'AZP_RAF_VTLD_PAGE_SWITCH_DN', 'VTLD ▼'),
  rafDial('Éclairage des panneaux', 'AZP_RAF_LIGHTING_PANEL_BACKLIGHT_INTENSITY', 'Panneaux'),
  rafDial('Éclairage des voyants', 'AZP_RAF_LIGHTING_INTERIOR_INDICATORS_INTENSITY', 'Voyants'),
  rafDial('Luminosité VTLG', 'AZP_RAF_AVIONICS_BRIGHTNESS_VTLG', 'Lum. VTLG'),
  rafDial('Luminosité VTLD', 'AZP_RAF_AVIONICS_BRIGHTNESS_VTLD', 'Lum. VTLD'),
];
