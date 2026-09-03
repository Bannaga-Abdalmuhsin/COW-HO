import { ChecklistDefinition, Site } from './types';

export type ChecklistCapability = 'truck';

export type ChecklistCapabilities = Record<ChecklistCapability, boolean>;

export type ChecklistSite = Partial<Pick<Site, 'hasTruckHead'>> | null | undefined;

export const CHECKLIST: ChecklistDefinition[] = [
  { key: 'power_configuration', title: 'Power Configuration', category: 'Power System', requiredPhotos: 1, helpText: 'Confirm live configuration and SEC connection.' },
  { key: 'mdb', title: 'MDB', category: 'Power System', requiredPhotos: 2, helpText: 'Capture enclosure and nameplate.' },
  { key: 'generator', title: 'Generator, ATS & Fuel Tank', category: 'Power System', requiredPhotos: 2 },
  { key: 'rectifier', title: 'Rectifier / DC System', category: 'Power System', requiredPhotos: 2 },
  { key: 'batteries', title: 'Batteries / BBU', category: 'Power System', requiredPhotos: 2 },
  { key: 'earthing', title: 'Earthing & Grounding', category: 'Power System', requiredPhotos: 2 },
  { key: 'ac_units', title: 'AC Units', category: 'Cooling & HVAC', requiredPhotos: 2 },
  { key: 'hvac', title: 'HVAC / PLC Controller', category: 'Cooling & HVAC', requiredPhotos: 1 },
  { key: 'facp', title: 'Fire Alarm Control Panel', category: 'Fire & Safety', requiredPhotos: 2 },
  { key: 'fire_cylinders', title: 'Firefighting Equipment', category: 'Fire & Safety', requiredPhotos: 2 },
  { key: 'door_sensor', title: 'Door Sensor', category: 'Fire & Safety', requiredPhotos: 1 },
  { key: 'lights', title: 'Internal & Security Lights', category: 'Fire & Safety', requiredPhotos: 1 },
  { key: 'emergency_light', title: 'Emergency Light', category: 'Fire & Safety', requiredPhotos: 1 },
  { key: 'tower', title: 'Tower Condition & Accessories', category: 'Tower System', requiredPhotos: 2 },
  { key: 'tower_motor', title: 'Tower Motor', category: 'Tower System', requiredPhotos: 1 },
  { key: 'motor_panel', title: 'Motor Control Panel', category: 'Tower System', requiredPhotos: 1 },
  { key: 'stepdown_transformer', title: 'Tower Motor Step-down Transformer', category: 'Tower System', requiredPhotos: 1 },
  { key: 'tower_telecom', title: 'Telecom Equipment on Tower', category: 'Tower System', requiredPhotos: 2 },
  { key: 'civil', title: 'Civil Condition', category: 'Shelter & Civil', requiredPhotos: 3 },
  { key: 'shelter_key', title: 'Shelter Key', category: 'Shelter & Civil', requiredPhotos: 1 },
  { key: 'vehicle_key', title: 'Vehicle Key', category: 'Vehicle', requiredPhotos: 1, conditional: 'truck' },
  { key: 'tires', title: 'Tires Status & Count', category: 'Vehicle', requiredPhotos: 4, conditional: 'truck' }
];

export function normalizeChecklistCapabilities(site: ChecklistSite): ChecklistCapabilities {
  return { truck: site?.hasTruckHead === true };
}

export function checklistForSite(site: ChecklistSite): ChecklistDefinition[] {
  const capabilities = normalizeChecklistCapabilities(site);
  return CHECKLIST.filter((item) => !item.conditional || capabilities[item.conditional]);
}

export function categoriesForSite(site: ChecklistSite): string[] {
  return [...new Set(checklistForSite(site).map((item) => item.category))];
}

export const categoryShortLabels: Record<string, string> = {
  'Power System': 'Power',
  'Cooling & HVAC': 'Cooling',
  'Fire & Safety': 'Safety',
  'Tower System': 'Tower',
  'Shelter & Civil': 'Civil',
  Vehicle: 'Vehicle'
};
