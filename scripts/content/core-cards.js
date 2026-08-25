import { MODULE_ID, MODULE_VERSION } from "../core/constants.js";
const CATEGORY_LABEL_KEYS = Object.freeze({
  city: "PF2E_CHASE_FORGE.CoreCards.CategoryCity",
  wilderness: "PF2E_CHASE_FORGE.CoreCards.CategoryWilderness",
  dungeon: "PF2E_CHASE_FORGE.CoreCards.CategoryDungeon",
  coast: "PF2E_CHASE_FORGE.CoreCards.CategoryCoast",
  mountain: "PF2E_CHASE_FORGE.CoreCards.CategoryMountain",
  social: "PF2E_CHASE_FORGE.CoreCards.CategorySocial",
});

function coreCard({ id, category, name, description, skills, type = "obstacle", extraTags = [] }) {
  const slug = id.replace(/^core:/, "");
  return {
    id, name, description, type,
    tags: ["chase", category, "land", "movement:land", ...extraTags],
    level: { min: 0, max: 20 },
    obstacle: { requiredPoints: 2, scalable: true },
    approaches: skills.map((statistic, index) => ({
      id: `${slug}-${statistic}-${index + 1}`, label: statistic, type: "check", statistic,
      dc: { mode: "level", levelOffset: 0, difficultyAdjustment: 0, hidden: true }, traits: [], requirements: []
    })),
    image: { mode: "automatic", path: null, providerId: null, imageId: null, alt: "", candidates: [] },
    metadata: {
      coreCard: true, category, imageTags: [category, ...extraTags],
      i18n: {
        name: `PF2E_CHASE_FORGE.CoreCards.${slug}.Name`,
        description: `PF2E_CHASE_FORGE.CoreCards.${slug}.Description`,
        category: CATEGORY_LABEL_KEYS[category]
      }
    }
  };
}

const CORE_CARDS = Object.freeze([
  coreCard({
    id: "core:city-crowded-market", category: "city", type: "obstacle",
    name: "Crowded Market", description: "Merchants, shoppers, and handcarts turn the street into a moving wall.",
    skills: ["acrobatics", "athletics", "diplomacy"], extraTags: ["crowd", "street"]
  }),
  coreCard({
    id: "core:city-overturned-cart", category: "city", type: "obstacle",
    name: "Overturned Cart", description: "A toppled cart and scattered cargo block the fastest line through the street.",
    skills: ["athletics", "acrobatics", "crafting"], extraTags: ["street", "debris"]
  }),
  coreCard({
    id: "core:city-rooftop-gap", category: "city", type: "obstacle",
    name: "Rooftop Gap", description: "The route leaps from one roof to the next across a dangerous open gap.",
    skills: ["acrobatics", "athletics"], extraTags: ["rooftop", "height"]
  }),
  coreCard({
    id: "core:city-narrow-alley", category: "city", type: "opportunity",
    name: "Narrow Alley", description: "A cramped side alley twists between walls, crates, and startled residents.",
    skills: ["acrobatics", "society", "thievery"], extraTags: ["alley", "shortcut"]
  }),
  coreCard({
    id: "core:city-city-gate", category: "city", type: "obstacle",
    name: "Closing City Gate", description: "The city gate is already closing as the chase reaches the walls.",
    skills: ["athletics", "diplomacy", "thievery"], extraTags: ["gate", "barrier"]
  }),
  coreCard({
    id: "core:city-canal-crossing", category: "city", type: "obstacle",
    name: "Canal Crossing", description: "A narrow canal cuts across the route, with only awkward ways to the far side.",
    skills: ["athletics", "acrobatics", "crafting"], extraTags: ["water", "bridge"]
  }),
  coreCard({
    id: "core:city-festival-procession", category: "city", type: "complication",
    name: "Festival Procession", description: "A loud procession fills the avenue with dancers, banners, and spectators.",
    skills: ["acrobatics", "performance", "diplomacy"], extraTags: ["crowd", "festival"]
  }),
  coreCard({
    id: "core:city-construction-scaffold", category: "city", type: "obstacle",
    name: "Construction Scaffold", description: "Scaffolding offers a fast elevated route, but every plank and ladder shifts underfoot.",
    skills: ["acrobatics", "athletics", "crafting"], extraTags: ["rooftop", "scaffold"]
  }),
  coreCard({
    id: "core:city-watch-patrol", category: "city", type: "complication",
    name: "Watch Patrol", description: "A patrol steps into the route at exactly the wrong moment and demands an explanation.",
    skills: ["deception", "diplomacy", "stealth"], extraTags: ["guards", "social"]
  }),
  coreCard({
    id: "core:city-laundry-lines", category: "city", type: "obstacle",
    name: "Laundry Lines", description: "Lines of laundry crisscross a tight courtyard and snag anyone moving too quickly.",
    skills: ["acrobatics", "athletics", "thievery"], extraTags: ["courtyard", "clutter"]
  }),
  coreCard({
    id: "core:city-crowded-stairs", category: "city", type: "obstacle",
    name: "Crowded Stairs", description: "A broad public stairway is packed with people moving in both directions.",
    skills: ["acrobatics", "athletics", "intimidation"], extraTags: ["crowd", "stairs"]
  }),
  coreCard({
    id: "core:city-carriage-traffic", category: "city", type: "obstacle",
    name: "Carriage Traffic", description: "Fast carriages and wagons stream through an intersection with barely a gap between them.",
    skills: ["acrobatics", "perception", "society"], extraTags: ["traffic", "street"]
  }),
  coreCard({
    id: "core:wilderness-fallen-tree", category: "wilderness", type: "obstacle",
    name: "Fallen Tree", description: "A massive fallen tree blocks the trail from bank to bank.",
    skills: ["athletics", "acrobatics", "nature"], extraTags: ["forest", "debris"]
  }),
  coreCard({
    id: "core:wilderness-thorn-thicket", category: "wilderness", type: "obstacle",
    name: "Thorn Thicket", description: "Dense thorny growth closes around the trail and tears at anyone forcing through.",
    skills: ["survival", "nature", "acrobatics"], extraTags: ["forest", "vegetation"]
  }),
  coreCard({
    id: "core:wilderness-swollen-stream", category: "wilderness", type: "obstacle",
    name: "Swollen Stream", description: "Recent rain has turned a normally shallow stream into a fast, muddy barrier.",
    skills: ["athletics", "survival", "nature"], extraTags: ["water", "river"]
  }),
  coreCard({
    id: "core:wilderness-muddy-slope", category: "wilderness", type: "obstacle",
    name: "Muddy Slope", description: "A steep slope has become slick mud, making every step a contest for balance.",
    skills: ["athletics", "acrobatics", "survival"], extraTags: ["mud", "slope"]
  }),
  coreCard({
    id: "core:wilderness-animal-herd", category: "wilderness", type: "complication",
    name: "Stampeding Herd", description: "A frightened herd surges across the chase route in a wall of hooves and bodies.",
    skills: ["nature", "survival", "acrobatics"], extraTags: ["animals", "crowd"]
  }),
  coreCard({
    id: "core:wilderness-loose-scree", category: "wilderness", type: "obstacle",
    name: "Loose Scree", description: "Loose stones slide underfoot and send noisy cascades down the slope.",
    skills: ["athletics", "acrobatics", "survival"], extraTags: ["stone", "slope"]
  }),
  coreCard({
    id: "core:wilderness-dense-underbrush", category: "wilderness", type: "obstacle",
    name: "Dense Underbrush", description: "The trail disappears into tangled brush where speed depends on reading the terrain.",
    skills: ["survival", "nature", "perception"], extraTags: ["forest", "vegetation"]
  }),
  coreCard({
    id: "core:wilderness-hidden-ravine", category: "wilderness", type: "complication",
    name: "Hidden Ravine", description: "A narrow ravine lies concealed by brush until the ground suddenly drops away.",
    skills: ["perception", "acrobatics", "athletics"], extraTags: ["ravine", "height"]
  }),
  coreCard({
    id: "core:wilderness-quicksand", category: "wilderness", type: "obstacle",
    name: "Sucking Mire", description: "Soft ground gives way beneath the runners and begins to pull at boots and legs.",
    skills: ["survival", "nature", "athletics"], extraTags: ["swamp", "mud"]
  }),
  coreCard({
    id: "core:wilderness-burning-brush", category: "wilderness", type: "complication",
    name: "Burning Brush", description: "Fire races through dry brush and cuts across the route in waves of heat and smoke.",
    skills: ["survival", "nature", "athletics"], extraTags: ["fire", "smoke"]
  }),
  coreCard({
    id: "core:wilderness-game-trail-shortcut", category: "wilderness", type: "opportunity",
    name: "Game Trail Shortcut", description: "A barely visible game trail offers a shorter route through rough terrain.",
    skills: ["survival", "nature", "perception"], extraTags: ["trail", "shortcut"]
  }),
  coreCard({
    id: "core:wilderness-log-bridge", category: "wilderness", type: "obstacle",
    name: "Fallen Log Bridge", description: "A single fallen trunk spans a stream or gully with little room for error.",
    skills: ["acrobatics", "athletics"], extraTags: ["bridge", "height"]
  }),
  coreCard({
    id: "core:dungeon-portcullis", category: "dungeon", type: "obstacle",
    name: "Falling Portcullis", description: "A heavy portcullis crashes downward and threatens to divide the chase.",
    skills: ["athletics", "thievery", "crafting"], extraTags: ["gate", "mechanical"]
  }),
  coreCard({
    id: "core:dungeon-collapsing-corridor", category: "dungeon", type: "complication",
    name: "Collapsing Corridor", description: "Stonework cracks and falls as the corridor begins to collapse around the runners.",
    skills: ["acrobatics", "athletics", "perception"], extraTags: ["collapse", "stone"]
  }),
  coreCard({
    id: "core:dungeon-trapped-floor", category: "dungeon", type: "obstacle",
    name: "Trapped Floor", description: "A suspicious stretch of floor hides plates, pits, or other dungeon mechanisms.",
    skills: ["thievery", "perception", "acrobatics"], extraTags: ["trap", "mechanical"]
  }),
  coreCard({
    id: "core:dungeon-flooded-passage", category: "dungeon", type: "obstacle",
    name: "Flooded Passage", description: "Dark water fills the passage and hides the safest footing.",
    skills: ["athletics", "survival", "perception"], extraTags: ["water", "darkness"]
  }),
  coreCard({
    id: "core:dungeon-rotating-statue", category: "dungeon", type: "obstacle",
    name: "Rotating Statue", description: "A huge stone mechanism turns across the passage and repeatedly blocks the route.",
    skills: ["thievery", "crafting", "arcana"], extraTags: ["mechanical", "stone"]
  }),
  coreCard({
    id: "core:dungeon-locked-iron-door", category: "dungeon", type: "obstacle",
    name: "Locked Iron Door", description: "A reinforced iron door stands between the chase and the next corridor.",
    skills: ["thievery", "athletics", "crafting"], extraTags: ["door", "barrier"]
  }),
  coreCard({
    id: "core:dungeon-crumbling-stairs", category: "dungeon", type: "obstacle",
    name: "Crumbling Stairs", description: "Ancient stairs shed stone beneath every hurried footstep.",
    skills: ["acrobatics", "athletics", "perception"], extraTags: ["stairs", "collapse"]
  }),
  coreCard({
    id: "core:dungeon-swinging-blades", category: "dungeon", type: "obstacle",
    name: "Swinging Blades", description: "Old trap blades sweep back and forth across the only open path.",
    skills: ["acrobatics", "thievery", "perception"], extraTags: ["trap", "blades"]
  }),
  coreCard({
    id: "core:dungeon-dark-maze", category: "dungeon", type: "obstacle",
    name: "Lightless Maze", description: "Intersecting passages vanish into darkness and make the direct route hard to judge.",
    skills: ["perception", "survival", "occultism"], extraTags: ["maze", "darkness"]
  }),
  coreCard({
    id: "core:dungeon-chain-over-chasm", category: "dungeon", type: "obstacle",
    name: "Chain over the Chasm", description: "A hanging chain or broken support is the only fast way across a deep opening.",
    skills: ["acrobatics", "athletics"], extraTags: ["chasm", "height"]
  }),
  coreCard({
    id: "core:dungeon-arcane-ward", category: "dungeon", type: "complication",
    name: "Arcane Ward", description: "A magical seal flares to life across the corridor as the chase approaches.",
    skills: ["arcana", "occultism", "religion"], extraTags: ["magic", "ward"]
  }),
  coreCard({
    id: "core:dungeon-maintenance-shaft", category: "dungeon", type: "opportunity",
    name: "Maintenance Shaft", description: "A narrow service shaft bypasses part of the dungeon for anyone who can use it quickly.",
    skills: ["thievery", "crafting", "acrobatics"], extraTags: ["shortcut", "mechanical"]
  }),
  coreCard({
    id: "core:coast-crashing-surf", category: "coast", type: "obstacle",
    name: "Crashing Surf", description: "Heavy surf pounds the shoreline and repeatedly cuts across the fastest route.",
    skills: ["athletics", "survival", "nature"], extraTags: ["water", "surf"]
  }),
  coreCard({
    id: "core:coast-slippery-jetty", category: "coast", type: "obstacle",
    name: "Slippery Jetty", description: "Spray-slick timbers turn a narrow jetty into a balance test at full speed.",
    skills: ["acrobatics", "athletics"], extraTags: ["dock", "slippery"]
  }),
  coreCard({
    id: "core:coast-fishing-nets", category: "coast", type: "obstacle",
    name: "Fishing Nets", description: "Coiled ropes and drying nets cover the dock in ankle-catching loops.",
    skills: ["acrobatics", "thievery", "athletics"], extraTags: ["dock", "nets"]
  }),
  coreCard({
    id: "core:coast-tide-pools", category: "coast", type: "obstacle",
    name: "Tide Pools", description: "Broken rock and deep tide pools force an irregular path along the shore.",
    skills: ["acrobatics", "survival", "nature"], extraTags: ["shore", "rocks"]
  }),
  coreCard({
    id: "core:coast-rocking-boats", category: "coast", type: "obstacle",
    name: "Rocking Boats", description: "Small boats tied side by side offer a quick but unstable path across the harbor.",
    skills: ["acrobatics", "athletics"], extraTags: ["boats", "water"]
  }),
  coreCard({
    id: "core:coast-cargo-crane", category: "coast", type: "opportunity",
    name: "Cargo Crane", description: "A dockside crane can turn height and swinging cargo into an unexpected shortcut.",
    skills: ["athletics", "crafting", "acrobatics"], extraTags: ["dock", "shortcut"]
  }),
  coreCard({
    id: "core:coast-sea-cave", category: "coast", type: "obstacle",
    name: "Sea Cave", description: "A sea cave cuts through the headland, but waves and darkness make it treacherous.",
    skills: ["survival", "athletics", "nature"], extraTags: ["cave", "water"]
  }),
  coreCard({
    id: "core:coast-rising-tide", category: "coast", type: "complication",
    name: "Rising Tide", description: "The tide is rapidly swallowing the strip of shore used by the chase.",
    skills: ["survival", "nature", "athletics"], extraTags: ["tide", "water"]
  }),
  coreCard({
    id: "core:coast-dockworkers", category: "coast", type: "obstacle",
    name: "Dockworker Crowd", description: "Workers hauling cargo fill the wharf and react badly to people charging through.",
    skills: ["diplomacy", "intimidation", "acrobatics"], extraTags: ["crowd", "dock"]
  }),
  coreCard({
    id: "core:coast-gull-swarm", category: "coast", type: "complication",
    name: "Gull Swarm", description: "A cloud of screaming gulls erupts around spilled food and obscures the route.",
    skills: ["nature", "acrobatics", "intimidation"], extraTags: ["animals", "air"]
  }),
  coreCard({
    id: "core:coast-broken-pier", category: "coast", type: "obstacle",
    name: "Broken Pier", description: "Missing planks leave a jagged sequence of gaps over cold harbor water.",
    skills: ["acrobatics", "athletics", "crafting"], extraTags: ["dock", "height"]
  }),
  coreCard({
    id: "core:coast-harbor-chain", category: "coast", type: "obstacle",
    name: "Harbor Chain", description: "A heavy chain drawn across the waterfront blocks passage at chest height.",
    skills: ["athletics", "thievery", "crafting"], extraTags: ["chain", "barrier"]
  }),
  coreCard({
    id: "core:mountain-narrow-ledge", category: "mountain", type: "obstacle",
    name: "Narrow Ledge", description: "The path narrows to a ledge with a long drop immediately beside it.",
    skills: ["acrobatics", "athletics"], extraTags: ["ledge", "height"]
  }),
  coreCard({
    id: "core:mountain-rockfall", category: "mountain", type: "complication",
    name: "Rockfall", description: "Loose rock tears down the mountainside and crosses the route in bouncing waves.",
    skills: ["perception", "acrobatics", "athletics"], extraTags: ["rockfall", "stone"]
  }),
  coreCard({
    id: "core:mountain-snowfield", category: "mountain", type: "obstacle",
    name: "Deep Snowfield", description: "Deep snow hides uneven ground and steals momentum from every stride.",
    skills: ["survival", "athletics", "nature"], extraTags: ["snow", "cold"]
  }),
  coreCard({
    id: "core:mountain-icy-slope", category: "mountain", type: "obstacle",
    name: "Icy Slope", description: "A sheet of hard ice covers the slope and offers almost no secure footing.",
    skills: ["acrobatics", "athletics", "survival"], extraTags: ["ice", "slope"]
  }),
  coreCard({
    id: "core:mountain-rope-bridge", category: "mountain", type: "obstacle",
    name: "Rope Bridge", description: "A weathered rope bridge sways over open air and groans under sudden weight.",
    skills: ["acrobatics", "crafting", "athletics"], extraTags: ["bridge", "height"]
  }),
  coreCard({
    id: "core:mountain-mountain-goats", category: "mountain", type: "obstacle",
    name: "Mountain Goat Herd", description: "A herd of mountain goats blocks the narrow trail and refuses to move predictably.",
    skills: ["nature", "survival", "acrobatics"], extraTags: ["animals", "trail"]
  }),
  coreCard({
    id: "core:mountain-avalanche-zone", category: "mountain", type: "complication",
    name: "Avalanche Zone", description: "The chase enters unstable snow where a wrong move can bring the whole slope down.",
    skills: ["survival", "perception", "athletics"], extraTags: ["snow", "avalanche"]
  }),
  coreCard({
    id: "core:mountain-thin-air", category: "mountain", type: "obstacle",
    name: "Thin Air", description: "The steep ascent and thin air make maintaining speed increasingly difficult.",
    skills: ["survival", "athletics", "medicine"], extraTags: ["altitude", "cold"]
  }),
  coreCard({
    id: "core:mountain-switchback-shortcut", category: "mountain", type: "opportunity",
    name: "Switchback Shortcut", description: "A steep direct climb can cut across several bends of the safer mountain path.",
    skills: ["athletics", "acrobatics", "survival"], extraTags: ["shortcut", "slope"]
  }),
  coreCard({
    id: "core:mountain-glacier-crevasse", category: "mountain", type: "obstacle",
    name: "Glacier Crevasse", description: "A blue-black crevasse splits the glacier across the direction of travel.",
    skills: ["perception", "acrobatics", "athletics"], extraTags: ["ice", "chasm"]
  }),
  coreCard({
    id: "core:mountain-cliff-climb", category: "mountain", type: "obstacle",
    name: "Cliff Climb", description: "The route rises abruptly up a rock face with only narrow holds.",
    skills: ["athletics", "acrobatics"], extraTags: ["cliff", "climb"]
  }),
  coreCard({
    id: "core:mountain-mine-track", category: "mountain", type: "opportunity",
    name: "Abandoned Mine Track", description: "An old mountain mine track offers a fast line through tunnels and across trestles.",
    skills: ["crafting", "acrobatics", "athletics"], extraTags: ["mine", "shortcut"]
  }),
  coreCard({
    id: "core:social-false-directions", category: "social", type: "obstacle",
    name: "False Directions", description: "Conflicting directions from bystanders threaten to send the chase down the wrong street.",
    skills: ["society", "diplomacy", "deception"], extraTags: ["social", "crowd"]
  }),
  coreCard({
    id: "core:social-closed-courtyard", category: "social", type: "obstacle",
    name: "Closed Courtyard", description: "A guarded private courtyard offers the shortest route, but access is not freely given.",
    skills: ["diplomacy", "deception", "intimidation"], extraTags: ["social", "gate"]
  }),
  coreCard({
    id: "core:social-panicked-crowd", category: "social", type: "complication",
    name: "Panicked Crowd", description: "A frightened crowd surges unpredictably and blocks the pursuit with bodies and shouting.",
    skills: ["diplomacy", "performance", "intimidation"], extraTags: ["social", "crowd"]
  }),
  coreCard({
    id: "core:social-checkpoint", category: "social", type: "obstacle",
    name: "Street Checkpoint", description: "Officials stop everyone passing through and demand names, papers, or a convincing reason.",
    skills: ["deception", "diplomacy", "society"], extraTags: ["social", "guards"]
  }),
  coreCard({
    id: "core:social-helpful-witness", category: "social", type: "opportunity",
    name: "Helpful Witness", description: "A witness saw the quarry pass and can reveal a valuable shortcut if convinced quickly.",
    skills: ["diplomacy", "society", "intimidation"], extraTags: ["social", "shortcut"]
  }),
  coreCard({
    id: "core:social-tavern-brawl", category: "social", type: "complication",
    name: "Tavern Brawl", description: "The chase bursts through a tavern just as an argument turns into a full-room brawl.",
    skills: ["acrobatics", "intimidation", "diplomacy"], extraTags: ["social", "interior"]
  }),
  coreCard({
    id: "core:social-vendor-stall", category: "social", type: "obstacle",
    name: "Street Vendor Stall", description: "A vendor and customers spill across the route, protecting fragile wares from the rushing chase.",
    skills: ["diplomacy", "deception", "society"], extraTags: ["social", "market"]
  }),
  coreCard({
    id: "core:social-noble-procession", category: "social", type: "obstacle",
    name: "Noble Procession", description: "A formal procession occupies the entire avenue and expects everyone else to yield.",
    skills: ["diplomacy", "society", "deception"], extraTags: ["social", "crowd"]
  }),
  coreCard({
    id: "core:social-rumor-network", category: "social", type: "obstacle",
    name: "Rumor Network", description: "Word of the chase spreads faster than the runners, but useful information is mixed with noise.",
    skills: ["society", "diplomacy", "deception"], extraTags: ["social", "information"]
  }),
  coreCard({
    id: "core:social-guard-questioning", category: "social", type: "complication",
    name: "Guard Questioning", description: "Alert guards stop the pursuers and insist on knowing exactly what is happening.",
    skills: ["deception", "diplomacy", "intimidation"], extraTags: ["social", "guards"]
  }),
  coreCard({
    id: "core:social-public-performance", category: "social", type: "obstacle",
    name: "Public Performance", description: "A street performance draws a dense ring of spectators around the quickest route.",
    skills: ["performance", "diplomacy", "intimidation"], extraTags: ["social", "crowd"]
  }),
  coreCard({
    id: "core:social-masquerade-crowd", category: "social", type: "obstacle",
    name: "Masquerade Crowd", description: "Masks, costumes, and look-alike revelers make it difficult to keep the right person in sight.",
    skills: ["perception", "society", "deception"], extraTags: ["social", "crowd", "festival"]
  }),
]);

export function createCoreCardPack() {
  return {
    id: "core:cards",
    label: "Chase Forge Core Card Library",
    description: "Reusable level-scaled Chase obstacle cards for city, wilderness, dungeon, coast, mountain, and social routes.",
    version: MODULE_VERSION, priority: 90, enabledByDefault: true,
    cards: CORE_CARDS.map(card => structuredClone(card)), templates: [], blueprints: [], imageProviders: [],
    metadata: { core: true, coreCards: true, sourceModule: MODULE_ID, i18n: { label: "PF2E_CHASE_FORGE.CoreCards.Pack", description: "PF2E_CHASE_FORGE.CoreCards.PackHint" } }
  };
}

export function listCoreCardDefinitions() { return CORE_CARDS.map(card => structuredClone(card)); }
