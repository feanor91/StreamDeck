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
export const isValidSimvar = (name) => /^[A-Z0-9 _]{2,64}(:\d{1,2})?$/.test(String(name || ''));

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
