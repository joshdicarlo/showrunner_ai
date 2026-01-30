
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
       },
       {
           id: 'asset-orbit',
           department: DepartmentType.CASTING_WARDROBE,
           title: 'Orbit',
           description: 'A small, spherical hovering drone with antigrav stabilizers and a single large optic lens. It communicates through expressive chirps and holographic projections.',
           summary: 'A small, spherical hovering drone.',
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
           width: 1250,
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
               label: 'Beat Sheet',
               prompt: 'Write a beat sheet for a chase scene in an asteroid field.', 
               text: `1. **The Signal**: @Zax and his copilot **Orbit** receive a distress call from the rebel leader **Kira**.\n2. **The Ambush**: The warlord **Vorg** intercepts the transmission and launches his fleet.\n3. **The Maneuver**: @Zax flies into the asteroid field while **Orbit** calculates the odds.\n4. **The Crash**: They are hit by **Vorg**'s cannon but **Kira** pulls them from the wreckage just in time.`,
               status: 'approved' 
           },
           width: 350, height: 400
       },
       // Outline
       { 
           id: 'n-outline', 
           type: NodeType.AI_TEXT_GEN, 
           department: DepartmentType.WRITERS_ROOM,
           parentId: 'seq-group',
           position: {x: 480, y: 120}, 
           data: { 
               label: 'Outline',
               prompt: 'Expand the beat sheet into a detailed scene outline with action descriptions and character moments.', 
               text: `## SEQUENCE 1: THE ASTEROID CHASE

### BEAT 1 — THE SIGNAL
- **Location**: INT. STARFIGHTER COCKPIT – DEEP SPACE
- **Action**: @Zax pilots through routine starfield. Warning lights blink softly. **Orbit** hovers near nav-com, optic lens scanning.
- **Inciting Incident**: Distress transmission crackles in—**Kira**'s voice, urgent and distorted, requesting immediate extraction.
- **Character Beat**: Zax and Orbit share a tense glance. Without hesitation, Zax commits: "Send her our coordinates. Full burn."

### BEAT 2 — THE AMBUSH
- **Location**: EXT. SPACE / INT. VORG'S FLAGSHIP
- **Action**: Before Orbit can respond, the transmission warps. Stars ahead darken as a massive warship emerges from hyperspace, followed by an armada.
- **Villain Introduction**: **Vorg**, armored and imposing, watches from his bridge. "Lock onto the source. No one answers Kira but me."
- **Stakes Raised**: Weapons charge. Alarms scream in Zax's cockpit.

### BEAT 3 — THE MANEUVER
- **Location**: EXT. ASTEROID FIELD / INT. COCKPIT
- **Action**: Zax spots the asteroid field and dives in. Chaotic tumbling rocks. Laser fire slices past, shattering asteroids into spinning debris.
- **Tension Builder**: Orbit projects survival probability: 0.7%. Emits a mournful hum.
- **Character Beat**: Zax, defiant: "I've flown worse."

### BEAT 4 — THE CRASH
- **Location**: EXT. SPACE / INT. COCKPIT / EXT. WRECKAGE
- **Action**: Blinding flash—Vorg's heavy cannon slams into the fighter. Ship spins out, trailing fire. Hull rips open. Decompression howls.
- **Rescue**: Rebel transport swoops in. **Kira**, battle-worn, reaches out from the open hatch as the wreck breaks apart.
- **Resolution**: "I've got you. Let go!" Zax grabs her hand. Orbit zips into the hold. The starfighter explodes behind them.
- **Tag**: Safe inside, Kira smiles grimly: "Took you long enough." Zax grins: "You always know how to make an entrance."`,
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
           position: {x: 880, y: 120}, 
           data: { 
               label: 'Script - The Signal',
               prompt: 'Convert the outline into a properly formatted screenplay scene.', 
               text: `### INT. STARFIGHTER COCKPIT – DEEP SPACE

Stars streak past the cockpit canopy. WARNING LIGHTS blink softly.

**ZAX**, tense but focused, pilots. **ORBIT**, a spherical hovering drone with antigrav stabilizers, floats near the nav-com, his single optic lens dilating nervously.

A sharp **BEEP**. An incoming transmission crackles to life.

**KIRA (V.O.)**
(distorted, urgent)
Zax—if you’re receiving this, we’re compromised. I need extraction. Now.

Zax exchanges a look with Orbit, who rotates his casing anxiously.

**ZAX**
Send her our coordinates. Full burn.

Before Orbit can chime a response, the transmission warps—another signal forcing its way through.

The stars ahead DARKEN.

### EXT. SPACE – CONTINUOUS

A massive warship emerges from hyperspace, followed by an entire **ARMADA**.

### INT. WARLORD VORG’S FLAGSHIP – BRIDGE

**VORG**, armored and imposing, watches the holographic readout with a thin smile.

**VORG**
Lock onto the source.
(low, pleased)
No one answers Kira but me.

Weapons charge.

### INT. STARFIGHTER COCKPIT – CONTINUOUS

Alarms SCREAM.

**ORBIT**
(panicked trill, spinning in mid-air)

**ZAX**
I see it. Asteroid field, dead ahead.

### EXT. ASTEROID FIELD – CONTINUOUS

Zax dives the fighter into a chaotic maze of tumbling rock. Laser fire slices past, shattering asteroids into spinning debris.

### INT. COCKPIT – CONTINUOUS

Zax wrestles the controls.

**ZAX**
Odds?

Orbit projects a quick 3D calculation into the air: **0.7% SURVIVAL PROBABILITY**.

Orbit emits a low, mournful hum.

**ZAX**
I’ve flown worse.

A BLINDING FLASH.

### EXT. SPACE – CONTINUOUS

A HEAVY CANNON BLAST from Vorg’s ship SLAMS into the fighter.

The ship SPINS OUT, trailing fire.

### INT. COCKPIT – CONTINUOUS

The hull RIPS OPEN. Zax is thrown forward as the cockpit decompression HOWLS.

Silence.

### EXT. WRECKAGE – MOMENTS LATER

The broken fighter drifts among the asteroids.

A sleek rebel transport SWOOPS IN, weaving effortlessly through the debris.

The rear hatch opens.

**KIRA**, battle-worn and determined, reaches out as the wreck begins to BREAK APART.

**KIRA**
I’ve got you. Let go!

Zax grabs her hand. Orbit engages his emergency thrusters and zips into the hold just as the starfighter EXPLODES behind them.

The rebel ship rockets away into the asteroid shadows.

### INT. REBEL TRANSPORT – CONTINUOUS

Zax gasps for breath. Kira pulls him up, relief flickering across her face. Orbit hovers protectively over Zax's shoulder.

Outside, Vorg’s fleet fires blindly into the field—too late.

**KIRA**
(smiles grimly)
Took you long enough.

Zax manages a breathless grin.

**ZAX**
You always know how to make an entrance.

**CUT TO BLACK.**`,
               status: 'approved' 
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
