/**
 * Landmark illustrations for map markers: one well-known building per coffee
 * country (by ISO code) and, where a coffee region has a clear one of its own,
 * per region (by region id). A region without one shows its country's. They
 * stand above the marker dot, large enough to recognize without zooming, so
 * people who don't know the map can still tell where a place is. The art is
 * colored SVG in public/map/landmarks/ (64×64, base on the bottom edge).
 *
 * Region ids are the preview catalog's; when the real catalog uses other ids,
 * its regions simply fall back to the country icon. Countries the table
 * doesn't know keep the plain dot.
 */

export interface Landmark {
  /** The building, in English; also the image's tooltip. */
  name: string;
  /** The illustration under public/. */
  src: string;
}

export const COUNTRY_LANDMARKS: Readonly<Record<string, Landmark>> = {
  ET: {
    name: "Obelisk of Axum",
    src: "/map/landmarks/et.svg",
  },
  KE: {
    name: "Kenyatta International Convention Centre, Nairobi",
    src: "/map/landmarks/ke.svg",
  },
  CO: {
    name: "Clock Tower Gate, Cartagena",
    src: "/map/landmarks/co.svg",
  },
  BR: {
    name: "Christ the Redeemer, Rio de Janeiro",
    src: "/map/landmarks/br.svg",
  },
  GT: {
    name: "Temple I, Tikal",
    src: "/map/landmarks/gt.svg",
  },
  ID: {
    name: "Borobudur",
    src: "/map/landmarks/id.svg",
  },
  VN: {
    name: "One Pillar Pagoda, Hanoi",
    src: "/map/landmarks/vn.svg",
  },
  YE: {
    name: "Tower houses of Old Sana'a",
    src: "/map/landmarks/ye.svg",
  },
  TR: {
    name: "Hagia Sophia, Istanbul",
    src: "/map/landmarks/tr.svg",
  },
  IT: {
    name: "Colosseum, Rome",
    src: "/map/landmarks/it.svg",
  },
  HN: {
    name: "Copán Maya ruins",
    src: "/map/landmarks/hn.svg",
  },
  MX: {
    name: "El Castillo, Chichén Itzá",
    src: "/map/landmarks/mx.svg",
  },
  CR: {
    name: "Painted oxcart (carreta)",
    src: "/map/landmarks/cr.svg",
  },
  SV: {
    name: "El Salvador del Mundo monument",
    src: "/map/landmarks/sv.svg",
  },
  NI: {
    name: "Granada Cathedral",
    src: "/map/landmarks/ni.svg",
  },
  PA: {
    name: "Panama Canal",
    src: "/map/landmarks/pa.svg",
  },
  JM: {
    name: "Blue Mountains",
    src: "/map/landmarks/jm.svg",
  },
  PE: {
    name: "Machu Picchu",
    src: "/map/landmarks/pe.svg",
  },
  BO: {
    name: "Gate of the Sun, Tiwanaku",
    src: "/map/landmarks/bo.svg",
  },
  EC: {
    name: "Mitad del Mundo, Quito",
    src: "/map/landmarks/ec.svg",
  },
  RW: {
    name: "King's Palace, Nyanza",
    src: "/map/landmarks/rw.svg",
  },
  BI: {
    name: "Royal drum of Burundi",
    src: "/map/landmarks/bi.svg",
  },
  UG: {
    name: "Kasubi Tombs, Kampala",
    src: "/map/landmarks/ug.svg",
  },
  TZ: {
    name: "Mount Kilimanjaro",
    src: "/map/landmarks/tz.svg",
  },
  IN: {
    name: "Taj Mahal",
    src: "/map/landmarks/in.svg",
  },
  CN: {
    name: "Great Wall of China",
    src: "/map/landmarks/cn.svg",
  },
  TH: {
    name: "Wat Arun, Bangkok",
    src: "/map/landmarks/th.svg",
  },
  LA: {
    name: "Pha That Luang, Vientiane",
    src: "/map/landmarks/la.svg",
  },
  PG: {
    name: "Parliament House, Port Moresby",
    src: "/map/landmarks/pg.svg",
  },
  PH: {
    name: "Mayon Volcano and Cagsawa Ruins",
    src: "/map/landmarks/ph.svg",
  },
  DO: {
    name: "Alcázar de Colón, Santo Domingo",
    src: "/map/landmarks/do.svg",
  },
  CU: {
    name: "El Capitolio, Havana",
    src: "/map/landmarks/cu.svg",
  },
  HT: {
    name: "Citadelle Laferrière",
    src: "/map/landmarks/ht.svg",
  },
  VE: {
    name: "Angel Falls",
    src: "/map/landmarks/ve.svg",
  },
  CI: {
    name: "Basilica of Our Lady of Peace, Yamoussoukro",
    src: "/map/landmarks/ci.svg",
  },
  CM: {
    name: "Reunification Monument, Yaoundé",
    src: "/map/landmarks/cm.svg",
  },
  CD: {
    name: "Okapi in the Congo rainforest",
    src: "/map/landmarks/cd.svg",
  },
  MW: {
    name: "Lake Malawi",
    src: "/map/landmarks/mw.svg",
  },
  ZM: {
    name: "Victoria Falls",
    src: "/map/landmarks/zm.svg",
  },
  ZW: {
    name: "Great Zimbabwe",
    src: "/map/landmarks/zw.svg",
  },
  MG: {
    name: "Avenue of the Baobabs",
    src: "/map/landmarks/mg.svg",
  },
  TG: {
    name: "Koutammakou tower house",
    src: "/map/landmarks/tg.svg",
  },
  GN: {
    name: "Grand Mosque of Conakry",
    src: "/map/landmarks/gn.svg",
  },
  MM: {
    name: "Bagan temples",
    src: "/map/landmarks/mm.svg",
  },
  LK: {
    name: "Sigiriya",
    src: "/map/landmarks/lk.svg",
  },
  NP: {
    name: "Boudhanath Stupa, Kathmandu",
    src: "/map/landmarks/np.svg",
  },
  TL: {
    name: "Uma Lulik sacred house",
    src: "/map/landmarks/tl.svg",
  },
  MY: {
    name: "Petronas Twin Towers",
    src: "/map/landmarks/my.svg",
  },
  JP: {
    name: "Mount Fuji and torii gate",
    src: "/map/landmarks/jp.svg",
  },
  KR: {
    name: "Gwanghwamun, Seoul",
    src: "/map/landmarks/kr.svg",
  },
  FR: {
    name: "Eiffel Tower",
    src: "/map/landmarks/fr.svg",
  },
  AT: {
    name: "St. Stephen's Cathedral, Vienna",
    src: "/map/landmarks/at.svg",
  },
  ES: {
    name: "Sagrada Família, Barcelona",
    src: "/map/landmarks/es.svg",
  },
  PT: {
    name: "Belém Tower, Lisbon",
    src: "/map/landmarks/pt.svg",
  },
  GR: {
    name: "Parthenon, Athens",
    src: "/map/landmarks/gr.svg",
  },
  DE: {
    name: "Brandenburg Gate, Berlin",
    src: "/map/landmarks/de.svg",
  },
  SE: {
    name: "Dala horse",
    src: "/map/landmarks/se.svg",
  },
  US: {
    name: "Statue of Liberty",
    src: "/map/landmarks/us.svg",
  },
  AU: {
    name: "Sydney Opera House",
    src: "/map/landmarks/au.svg",
  },
  SA: {
    name: "Kingdom Centre, Riyadh",
    src: "/map/landmarks/sa.svg",
  },
};

export const REGION_LANDMARKS: Readonly<Record<string, Landmark>> = {
  "ethiopia-harar": {
    name: "Harar Gate (Jugol)",
    src: "/map/landmarks/ethiopia-harar.svg",
  },
  "colombia-narino": {
    name: "Las Lajas Sanctuary",
    src: "/map/landmarks/colombia-narino.svg",
  },
  "guatemala-antigua": {
    name: "Santa Catalina Arch, Antigua",
    src: "/map/landmarks/guatemala-antigua.svg",
  },
  "guatemala-huehuetenango": {
    name: "Zaculeu",
    src: "/map/landmarks/guatemala-huehuetenango.svg",
  },
  "indonesia-gayo": {
    name: "Baiturrahman Grand Mosque, Banda Aceh",
    src: "/map/landmarks/indonesia-gayo.svg",
  },
  "vietnam-central-highlands": {
    name: "Rông communal house",
    src: "/map/landmarks/vietnam-central-highlands.svg",
  },
  "yemen-haraz": {
    name: "Al-Hajjarah, Haraz Mountains",
    src: "/map/landmarks/yemen-haraz.svg",
  },
  "brazil-sul-de-minas": {
    name: "Colonial baroque church, Minas Gerais",
    src: "/map/landmarks/brazil-sul-de-minas.svg",
  },
};

/**
 * Countries whose landmark most people know, most famous first. When
 * illustrations crowd, these stay up over equally sized neighbours (markers.ts).
 */
const FAMOUS = ["FR", "IT", "US", "IN", "CN", "JP", "BR", "PE", "GR", "MX", "AU", "ES", "DE", "TR", "TZ", "KE", "ET"];

/** Lower is better known; countries not in FAMOUS share the last place. */
export function landmarkFame(landmark: Landmark): number {
  const index = FAMOUS.findIndex((iso) => COUNTRY_LANDMARKS[iso]?.src === landmark.src);
  return index === -1 ? FAMOUS.length : index;
}

/** The icon for a marker: the region's own landmark, else its country's, else none. */
export function landmarkFor(iso: string | null, regionId: string | null = null): Landmark | null {
  if (regionId && REGION_LANDMARKS[regionId]) return REGION_LANDMARKS[regionId];
  return (iso && COUNTRY_LANDMARKS[iso]) || null;
}
