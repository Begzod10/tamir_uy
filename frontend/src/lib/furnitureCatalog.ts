export interface MaterialSlot {
  /** Internal GLB material name */
  name: string
  /** Human-readable label shown in UI */
  label: string
}

export type FurnitureCategory =
  | 'divan'
  | 'stol'
  | 'stul'
  | 'karavot'
  | 'shkaf'
  | 'lampa'
  | 'boshqa'

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  divan:  'Divan',
  stol:   'Stol',
  stul:   "Stul",
  karavot:'Karavot',
  shkaf:  'Shkaf',
  lampa:  'Lampa',
  boshqa: 'Boshqa',
}

export interface FurnitureCatalogEntry {
  id: string
  name: string
  emoji: string
  modelPath: string
  dracoPath: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  category: FurnitureCategory
  /** Named material slots for per-material color overrides */
  materialSlots?: MaterialSlot[]
}

export const FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  {
    id: 'boconcept_hauge_table',
    name: "Bo Concept Hauge stol to'plami",
    emoji: '🍽️',
    modelPath: '/models/table_boconcept_hauge.glb',
    dracoPath: '',
    scale: 0.001,
    sizeM: { w: 1.84, d: 1.83, h: 0.82 },
    category: 'stol',
    materialSlots: [
      { name: 'wire_115115115', label: "Yog'och" },
      { name: 'wire_088144225', label: 'Mato' },
      { name: 'wire_086086086', label: 'Metal' },
    ],
  },
  {
    id: 'couch_84',
    name: "Uch o'rinli divan",
    emoji: '🛋️',
    modelPath: '/models/couch_84.glb',
    dracoPath: '',
    scale: 1,
    sizeM: { w: 2.10, d: 0.90, h: 0.80 },
    category: 'divan',
    materialSlots: [
      { name: 'Fabric', label: 'Mato' },
      { name: 'Wood', label: "Yog'och" },
    ],
  },
]
