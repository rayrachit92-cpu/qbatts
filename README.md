# Q_BATTS — EV Battery Thermal Intelligence

Interactive scientific dashboard (React 18 + TypeScript + Vite, Three.js / React Three Fiber, Recharts, Zustand).
**All data is simulated** by a reduced-order, physics-inspired model that runs in the browser.

## Run
    npm install
    npm run dev          # http://localhost:5173
    npm run build        # typecheck + production build
    npm run preview      # serve the build
    npm test             # 47 tests (physics + every page/control)

## Architecture
- `src/store.ts` – single shared state (ambient, load, charge, cooling, SOC, age, fault, composite, thresholds) + scenario presets
- `src/derive.ts` – derived pack model used by every page (`usePack`)
- `src/physics/` – core thermal grid, runaway kinetics, charging, degradation, propagation, materials, cooling, quantum-inspired maths
- `src/components/` – UI kit, shared `Controls`, `Pack3D` (R3F)
- `src/pages/` – the 12 pages
# qbatts
