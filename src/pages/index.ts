import { ComponentType } from 'react';
import type { PageId } from '../store';
import Overview from './Overview'; import Battery3D from './Battery3D'; import Runaway from './Runaway'; import Distribution from './Distribution';
import Charging from './Charging'; import Extreme from './Extreme'; import Degradation from './Degradation'; import Hotspot from './Hotspot';
import Propagation from './Propagation'; import Cooling from './Cooling'; import Materials from './Materials'; import Quantum from './Quantum';
export const PAGES: { id: PageId; label: string; Comp: ComponentType }[] = [
  { id: 'overview', label: 'Overview', Comp: Overview }, { id: 'battery3d', label: '3D Battery', Comp: Battery3D },
  { id: 'runaway', label: 'Thermal Runaway', Comp: Runaway }, { id: 'distribution', label: 'Temperature Distribution', Comp: Distribution },
  { id: 'charging', label: 'Fast Charging', Comp: Charging }, { id: 'extreme', label: 'Extreme Temperature', Comp: Extreme },
  { id: 'degradation', label: 'Degradation', Comp: Degradation }, { id: 'hotspot', label: 'Hotspot Detection', Comp: Hotspot },
  { id: 'propagation', label: 'Thermal Propagation', Comp: Propagation }, { id: 'cooling', label: 'Cooling Optimization', Comp: Cooling },
  { id: 'materials', label: 'Composite Materials', Comp: Materials }, { id: 'quantum', label: 'Quantum AI Lab', Comp: Quantum },
];
