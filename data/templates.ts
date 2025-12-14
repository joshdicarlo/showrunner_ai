
import { DepartmentType, NodeType, Project } from "../types";
import { DEFAULT_PROJECT_SETTINGS } from "../constants";

const demoAssetId = 'asset-1';

export const GALACTIC_COURIER_TEMPLATE: Project = {
    id: 'demo-1',
    title: 'The Galactic Courier',
    summary: 'A sci-fi adventure about a courier delivering a package to the wrong dimension.',
    type: 'Feature',
    assets: [
       {
           id: demoAssetId,
           department: DepartmentType.CASTING_WARDROBE,
           title: 'Zax',
           description: 'A cynical robot courier with a rusted chassis and a heart of gold. He often malfunctions at inconvenient times but always delivers the package.',
           summary: 'A cynical robot courier with a rusted chassis.',
           status: 'active'
       }
    ],
    nodes: [
       // Writers Room Sequence Group
       {
           id: 'seq-group',
           type: NodeType.GROUP,
           department: DepartmentType.WRITERS_ROOM,
           position: { x: 50, y: 50 },
           width: 850,
           height: 550,
           data: { label: "Sequence 1", collapsed: false }
       },
       // Beat Sheet
       { 
           id: 'n-beat', 
           type: NodeType.AI_TEXT_GEN, 
           department: DepartmentType.WRITERS_ROOM,
           parentId: 'seq-group',
           position: {x: 80, y: 120}, 
           data: { 
               prompt: 'Write a beat sheet for a chase scene in an asteroid field.', 
               text: `1. **The Signal**: @Zax and his copilot **R-7** receive a distress call from the rebel leader **Kira**.\n2. **The Ambush**: The warlord **Vorg** intercepts the transmission and launches his fleet.\n3. **The Maneuver**: @Zax flies into the asteroid field while **R-7** calculates the odds.\n4. **The Crash**: They are hit by **Vorg**'s cannon but **Kira** pulls them from the wreckage just in time.`,
               status: 'approved' 
           },
           width: 350, height: 400
       },
       // Script
       { 
           id: 'n-script', 
           type: NodeType.AI_TEXT_GEN, 
           department: DepartmentType.WRITERS_ROOM,
           parentId: 'seq-group',
           position: {x: 480, y: 120}, 
           data: { 
               prompt: 'Convert the beat sheet into a script scene.', 
               text: `INT. COCKPIT - DAY\n\n@ZAX struggles with the controls. His small drone companion, R-7, beeps frantically attached to the dashboard.\n\n@ZAX\nQuiet, R-7! I know the odds!\n\nOn the com-link, KIRA's voice crackles through, urgent and commanding.\n\nKIRA (V.O.)\nVorg is right behind you, Zax! Dive into the nebula!\n\nEXT. ASTEROID FIELD - CONTINUOUS\n\nThe courier ship weaves through the debris, narrowly dodging VORG'S massive flagship plasma blasts.`,
               status: 'review' 
           },
           width: 350, height: 400
       }
    ],
    connections: [],
    updatedAt: new Date(),
    settings: {
        ...DEFAULT_PROJECT_SETTINGS,
        defaultStyleId: 'style-pixar'
    }
};

export const TEMPLATES = [GALACTIC_COURIER_TEMPLATE];
