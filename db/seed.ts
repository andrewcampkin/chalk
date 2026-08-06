import type { NewMovement } from "./schema";

/**
 * The app is useless empty. Hand-typing "Thruster" every session is what kills
 * the logging habit, so ship with the vocabulary already loaded.
 *
 * Two lists. MOVEMENTS is the exercise vocabulary. BENCHMARKS are named
 * workouts, which live in the same table so that one search box covers both —
 * and each one declares the movement slugs it contains, so logging "Fran"
 * writes block_movements rows for thruster and pull-up automatically. That is
 * what makes "show me every session with a thruster" return your Frans.
 */

type SeedMovement = {
  name: string;
  slug: string;
  modality: NonNullable<NewMovement["modality"]>;
  pattern: string;
  aliases?: string[];
  defaultScoreType?: NonNullable<NewMovement["defaultScoreType"]>;
};

type SeedBenchmark = {
  name: string;
  slug: string;
  prescription: string;
  /** Slugs from MOVEMENTS. Drives auto-tagging and therefore search. */
  movements: string[];
  defaultScoreType: NonNullable<NewMovement["defaultScoreType"]>;
};

/* -------------------------------------------------------------------------- */
/* movements                                                                   */
/* -------------------------------------------------------------------------- */

export const MOVEMENTS: SeedMovement[] = [
  // --- barbell: squat -------------------------------------------------------
  { name: "Back Squat", slug: "back-squat", modality: "barbell", pattern: "squat", aliases: ["BS"], defaultScoreType: "load" },
  { name: "Front Squat", slug: "front-squat", modality: "barbell", pattern: "squat", aliases: ["FS"], defaultScoreType: "load" },
  { name: "Overhead Squat", slug: "overhead-squat", modality: "barbell", pattern: "squat", aliases: ["OHS"], defaultScoreType: "load" },
  { name: "Air Squat", slug: "air-squat", modality: "gymnastics", pattern: "squat", aliases: ["bodyweight squat"], defaultScoreType: "reps" },
  { name: "Pistol", slug: "pistol", modality: "gymnastics", pattern: "squat", aliases: ["single leg squat"], defaultScoreType: "reps" },

  // --- barbell: hinge -------------------------------------------------------
  { name: "Deadlift", slug: "deadlift", modality: "barbell", pattern: "hinge", aliases: ["DL"], defaultScoreType: "load" },
  { name: "Sumo Deadlift High Pull", slug: "sumo-deadlift-high-pull", modality: "barbell", pattern: "hinge", aliases: ["SDHP"], defaultScoreType: "load" },
  { name: "Good Morning", slug: "good-morning", modality: "barbell", pattern: "hinge", defaultScoreType: "load" },
  { name: "Romanian Deadlift", slug: "romanian-deadlift", modality: "barbell", pattern: "hinge", aliases: ["RDL"], defaultScoreType: "load" },

  // --- barbell: olympic -----------------------------------------------------
  { name: "Clean", slug: "clean", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Squat Clean", slug: "squat-clean", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Power Clean", slug: "power-clean", modality: "barbell", pattern: "pull", aliases: ["PC"], defaultScoreType: "load" },
  { name: "Hang Power Clean", slug: "hang-power-clean", modality: "barbell", pattern: "pull", aliases: ["HPC"], defaultScoreType: "load" },
  { name: "Hang Squat Clean", slug: "hang-squat-clean", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Clean and Jerk", slug: "clean-and-jerk", modality: "barbell", pattern: "pull", aliases: ["C&J", "CJ"], defaultScoreType: "load" },
  { name: "Snatch", slug: "snatch", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Squat Snatch", slug: "squat-snatch", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Power Snatch", slug: "power-snatch", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Hang Power Snatch", slug: "hang-power-snatch", modality: "barbell", pattern: "pull", aliases: ["HPS"], defaultScoreType: "load" },
  { name: "Snatch Balance", slug: "snatch-balance", modality: "barbell", pattern: "press", defaultScoreType: "load" },
  { name: "Clean Pull", slug: "clean-pull", modality: "barbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Snatch Pull", slug: "snatch-pull", modality: "barbell", pattern: "pull", defaultScoreType: "load" },

  // --- barbell: press -------------------------------------------------------
  { name: "Shoulder Press", slug: "shoulder-press", modality: "barbell", pattern: "press", aliases: ["strict press", "military press"], defaultScoreType: "load" },
  { name: "Push Press", slug: "push-press", modality: "barbell", pattern: "press", aliases: ["PP"], defaultScoreType: "load" },
  { name: "Push Jerk", slug: "push-jerk", modality: "barbell", pattern: "press", defaultScoreType: "load" },
  { name: "Split Jerk", slug: "split-jerk", modality: "barbell", pattern: "press", defaultScoreType: "load" },
  { name: "Thruster", slug: "thruster", modality: "barbell", pattern: "press", defaultScoreType: "load" },
  { name: "Bench Press", slug: "bench-press", modality: "barbell", pattern: "press", aliases: ["BP"], defaultScoreType: "load" },
  { name: "Barbell Row", slug: "barbell-row", modality: "barbell", pattern: "pull", aliases: ["bent over row"], defaultScoreType: "load" },
  { name: "Front Rack Lunge", slug: "front-rack-lunge", modality: "barbell", pattern: "squat", defaultScoreType: "load" },
  { name: "Overhead Lunge", slug: "overhead-lunge", modality: "barbell", pattern: "squat", defaultScoreType: "load" },
  { name: "Cluster", slug: "cluster", modality: "barbell", pattern: "press", aliases: ["squat clean thruster"], defaultScoreType: "load" },

  // --- dumbbell -------------------------------------------------------------
  { name: "Dumbbell Snatch", slug: "dumbbell-snatch", modality: "dumbbell", pattern: "pull", aliases: ["DB snatch"], defaultScoreType: "load" },
  { name: "Dumbbell Thruster", slug: "dumbbell-thruster", modality: "dumbbell", pattern: "press", aliases: ["DB thruster"], defaultScoreType: "load" },
  { name: "Dumbbell Clean and Jerk", slug: "dumbbell-clean-and-jerk", modality: "dumbbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Dumbbell Push Press", slug: "dumbbell-push-press", modality: "dumbbell", pattern: "press", defaultScoreType: "load" },
  { name: "Dumbbell Front Squat", slug: "dumbbell-front-squat", modality: "dumbbell", pattern: "squat", defaultScoreType: "load" },
  { name: "Dumbbell Bench Press", slug: "dumbbell-bench-press", modality: "dumbbell", pattern: "press", defaultScoreType: "load" },
  { name: "Dumbbell Row", slug: "dumbbell-row", modality: "dumbbell", pattern: "pull", defaultScoreType: "load" },
  { name: "Devil's Press", slug: "devils-press", modality: "dumbbell", pattern: "press", defaultScoreType: "reps" },
  { name: "Man Maker", slug: "man-maker", modality: "dumbbell", pattern: "press", defaultScoreType: "reps" },
  { name: "Farmers Carry", slug: "farmers-carry", modality: "dumbbell", pattern: "carry", defaultScoreType: "distance" },

  // --- gymnastics: pull -----------------------------------------------------
  { name: "Pull-up", slug: "pull-up", modality: "gymnastics", pattern: "pull", aliases: ["pullup", "pull up"], defaultScoreType: "reps" },
  { name: "Strict Pull-up", slug: "strict-pull-up", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Chest-to-Bar Pull-up", slug: "chest-to-bar-pull-up", modality: "gymnastics", pattern: "pull", aliases: ["C2B", "CTB"], defaultScoreType: "reps" },
  { name: "Butterfly Pull-up", slug: "butterfly-pull-up", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Jumping Pull-up", slug: "jumping-pull-up", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Chin-up", slug: "chin-up", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Ring Row", slug: "ring-row", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Ring Muscle-up", slug: "ring-muscle-up", modality: "gymnastics", pattern: "pull", aliases: ["muscle up", "MU", "RMU"], defaultScoreType: "reps" },
  { name: "Bar Muscle-up", slug: "bar-muscle-up", modality: "gymnastics", pattern: "pull", aliases: ["BMU"], defaultScoreType: "reps" },
  { name: "Strict Muscle-up", slug: "strict-muscle-up", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Rope Climb", slug: "rope-climb", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },
  { name: "Legless Rope Climb", slug: "legless-rope-climb", modality: "gymnastics", pattern: "pull", defaultScoreType: "reps" },

  // --- gymnastics: press ----------------------------------------------------
  { name: "Handstand Push-up", slug: "handstand-push-up", modality: "gymnastics", pattern: "press", aliases: ["HSPU"], defaultScoreType: "reps" },
  { name: "Strict Handstand Push-up", slug: "strict-handstand-push-up", modality: "gymnastics", pattern: "press", aliases: ["strict HSPU"], defaultScoreType: "reps" },
  { name: "Deficit Handstand Push-up", slug: "deficit-handstand-push-up", modality: "gymnastics", pattern: "press", defaultScoreType: "reps" },
  { name: "Handstand Walk", slug: "handstand-walk", modality: "gymnastics", pattern: "press", aliases: ["HS walk"], defaultScoreType: "distance" },
  { name: "Handstand Hold", slug: "handstand-hold", modality: "gymnastics", pattern: "press", defaultScoreType: "time" },
  { name: "Wall Walk", slug: "wall-walk", modality: "gymnastics", pattern: "press", defaultScoreType: "reps" },
  { name: "Push-up", slug: "push-up", modality: "gymnastics", pattern: "press", aliases: ["pushup"], defaultScoreType: "reps" },
  { name: "Ring Push-up", slug: "ring-push-up", modality: "gymnastics", pattern: "press", defaultScoreType: "reps" },
  { name: "Ring Dip", slug: "ring-dip", modality: "gymnastics", pattern: "press", defaultScoreType: "reps" },
  { name: "Bar Dip", slug: "bar-dip", modality: "gymnastics", pattern: "press", aliases: ["dip"], defaultScoreType: "reps" },

  // --- gymnastics: core & misc ---------------------------------------------
  { name: "Toes-to-Bar", slug: "toes-to-bar", modality: "gymnastics", pattern: "core", aliases: ["T2B", "TTB", "toes to bar"], defaultScoreType: "reps" },
  { name: "Knees-to-Elbows", slug: "knees-to-elbows", modality: "gymnastics", pattern: "core", aliases: ["K2E", "KTE"], defaultScoreType: "reps" },
  { name: "GHD Sit-up", slug: "ghd-sit-up", modality: "gymnastics", pattern: "core", aliases: ["GHD"], defaultScoreType: "reps" },
  { name: "AbMat Sit-up", slug: "abmat-sit-up", modality: "gymnastics", pattern: "core", aliases: ["sit-up", "situp"], defaultScoreType: "reps" },
  { name: "Hollow Rock", slug: "hollow-rock", modality: "gymnastics", pattern: "core", defaultScoreType: "reps" },
  { name: "L-Sit", slug: "l-sit", modality: "gymnastics", pattern: "core", defaultScoreType: "time" },
  { name: "Plank Hold", slug: "plank-hold", modality: "gymnastics", pattern: "core", defaultScoreType: "time" },
  { name: "Back Extension", slug: "back-extension", modality: "gymnastics", pattern: "hinge", defaultScoreType: "reps" },
  { name: "Hip Extension", slug: "hip-extension", modality: "gymnastics", pattern: "hinge", defaultScoreType: "reps" },
  { name: "Burpee", slug: "burpee", modality: "gymnastics", pattern: "engine", defaultScoreType: "reps" },
  { name: "Bar-Facing Burpee", slug: "bar-facing-burpee", modality: "gymnastics", pattern: "engine", aliases: ["BFB"], defaultScoreType: "reps" },
  { name: "Burpee Box Jump Over", slug: "burpee-box-jump-over", modality: "gymnastics", pattern: "engine", aliases: ["BBJO"], defaultScoreType: "reps" },
  { name: "Box Jump", slug: "box-jump", modality: "gymnastics", pattern: "squat", defaultScoreType: "reps" },
  { name: "Box Jump Over", slug: "box-jump-over", modality: "gymnastics", pattern: "squat", aliases: ["BJO"], defaultScoreType: "reps" },
  { name: "Box Step-Up", slug: "box-step-up", modality: "gymnastics", pattern: "squat", defaultScoreType: "reps" },
  { name: "Walking Lunge", slug: "walking-lunge", modality: "gymnastics", pattern: "squat", defaultScoreType: "reps" },

  // --- monostructural -------------------------------------------------------
  { name: "Run", slug: "run", modality: "monostructural", pattern: "engine", defaultScoreType: "distance" },
  { name: "Shuttle Run", slug: "shuttle-run", modality: "monostructural", pattern: "engine", defaultScoreType: "distance" },
  { name: "Row", slug: "row", modality: "monostructural", pattern: "engine", aliases: ["C2", "erg"], defaultScoreType: "distance" },
  { name: "Bike Erg", slug: "bike-erg", modality: "monostructural", pattern: "engine", defaultScoreType: "distance" },
  { name: "Assault Bike", slug: "assault-bike", modality: "monostructural", pattern: "engine", aliases: ["echo bike", "air bike"], defaultScoreType: "distance" },
  { name: "Ski Erg", slug: "ski-erg", modality: "monostructural", pattern: "engine", defaultScoreType: "distance" },
  { name: "Swim", slug: "swim", modality: "monostructural", pattern: "engine", defaultScoreType: "distance" },
  { name: "Double-Under", slug: "double-under", modality: "monostructural", pattern: "engine", aliases: ["DU", "double unders"], defaultScoreType: "reps" },
  { name: "Single-Under", slug: "single-under", modality: "monostructural", pattern: "engine", defaultScoreType: "reps" },
  { name: "Crossover", slug: "crossover", modality: "monostructural", pattern: "engine", defaultScoreType: "reps" },

  // --- odd object -----------------------------------------------------------
  { name: "Kettlebell Swing", slug: "kettlebell-swing", modality: "odd_object", pattern: "hinge", aliases: ["KBS", "KB swing", "American swing"], defaultScoreType: "reps" },
  { name: "Russian Kettlebell Swing", slug: "russian-kettlebell-swing", modality: "odd_object", pattern: "hinge", defaultScoreType: "reps" },
  { name: "Kettlebell Snatch", slug: "kettlebell-snatch", modality: "odd_object", pattern: "pull", defaultScoreType: "reps" },
  { name: "Kettlebell Clean", slug: "kettlebell-clean", modality: "odd_object", pattern: "pull", defaultScoreType: "reps" },
  { name: "Goblet Squat", slug: "goblet-squat", modality: "odd_object", pattern: "squat", defaultScoreType: "load" },
  { name: "Turkish Get-Up", slug: "turkish-get-up", modality: "odd_object", pattern: "press", aliases: ["TGU"], defaultScoreType: "load" },
  { name: "Wall Ball", slug: "wall-ball", modality: "odd_object", pattern: "squat", aliases: ["WB", "wall ball shot"], defaultScoreType: "reps" },
  { name: "Medicine Ball Clean", slug: "medicine-ball-clean", modality: "odd_object", pattern: "pull", defaultScoreType: "reps" },
  { name: "Sandbag Clean", slug: "sandbag-clean", modality: "odd_object", pattern: "pull", defaultScoreType: "reps" },
  { name: "Sandbag Carry", slug: "sandbag-carry", modality: "odd_object", pattern: "carry", defaultScoreType: "distance" },
  { name: "D-Ball Over Shoulder", slug: "d-ball-over-shoulder", modality: "odd_object", pattern: "hinge", defaultScoreType: "reps" },
  { name: "Sled Push", slug: "sled-push", modality: "odd_object", pattern: "carry", defaultScoreType: "distance" },
  { name: "Sled Pull", slug: "sled-pull", modality: "odd_object", pattern: "carry", defaultScoreType: "distance" },
  { name: "Yoke Carry", slug: "yoke-carry", modality: "odd_object", pattern: "carry", defaultScoreType: "distance" },
  { name: "Tire Flip", slug: "tire-flip", modality: "odd_object", pattern: "hinge", defaultScoreType: "reps" },
];

/* -------------------------------------------------------------------------- */
/* benchmarks                                                                  */
/* -------------------------------------------------------------------------- */

export const BENCHMARKS: SeedBenchmark[] = [
  // --- the girls ------------------------------------------------------------
  { name: "Fran", slug: "fran", prescription: "21-15-9 reps for time: thruster (95/65 lb), pull-up", movements: ["thruster", "pull-up"], defaultScoreType: "time" },
  { name: "Grace", slug: "grace", prescription: "30 clean and jerks for time (135/95 lb)", movements: ["clean-and-jerk"], defaultScoreType: "time" },
  { name: "Isabel", slug: "isabel", prescription: "30 snatches for time (135/95 lb)", movements: ["snatch"], defaultScoreType: "time" },
  { name: "Helen", slug: "helen", prescription: "3 rounds for time: 400 m run, 21 kettlebell swings (53/35 lb), 12 pull-ups", movements: ["run", "kettlebell-swing", "pull-up"], defaultScoreType: "time" },
  { name: "Cindy", slug: "cindy", prescription: "20 min AMRAP: 5 pull-ups, 10 push-ups, 15 air squats", movements: ["pull-up", "push-up", "air-squat"], defaultScoreType: "rounds_reps" },
  { name: "Diane", slug: "diane", prescription: "21-15-9 reps for time: deadlift (225/155 lb), handstand push-up", movements: ["deadlift", "handstand-push-up"], defaultScoreType: "time" },
  { name: "Elizabeth", slug: "elizabeth", prescription: "21-15-9 reps for time: clean (135/95 lb), ring dip", movements: ["clean", "ring-dip"], defaultScoreType: "time" },
  { name: "Jackie", slug: "jackie", prescription: "For time: 1,000 m row, 50 thrusters (45 lb), 30 pull-ups", movements: ["row", "thruster", "pull-up"], defaultScoreType: "time" },
  { name: "Karen", slug: "karen", prescription: "150 wall-ball shots for time (20/14 lb)", movements: ["wall-ball"], defaultScoreType: "time" },
  { name: "Annie", slug: "annie", prescription: "50-40-30-20-10 reps for time: double-under, sit-up", movements: ["double-under", "abmat-sit-up"], defaultScoreType: "time" },
  { name: "Angie", slug: "angie", prescription: "For time: 100 pull-ups, 100 push-ups, 100 sit-ups, 100 air squats", movements: ["pull-up", "push-up", "abmat-sit-up", "air-squat"], defaultScoreType: "time" },
  { name: "Barbara", slug: "barbara", prescription: "5 rounds, resting 3 min between: 20 pull-ups, 30 push-ups, 40 sit-ups, 50 air squats", movements: ["pull-up", "push-up", "abmat-sit-up", "air-squat"], defaultScoreType: "time" },
  { name: "Chelsea", slug: "chelsea", prescription: "EMOM 30 min: 5 pull-ups, 10 push-ups, 15 air squats", movements: ["pull-up", "push-up", "air-squat"], defaultScoreType: "rounds_reps" },
  { name: "Linda", slug: "linda", prescription: "10-9-8-7-6-5-4-3-2-1 reps for time: deadlift (1.5x bodyweight), bench press (bodyweight), clean (0.75x bodyweight)", movements: ["deadlift", "bench-press", "clean"], defaultScoreType: "time" },
  { name: "Mary", slug: "mary", prescription: "20 min AMRAP: 5 handstand push-ups, 10 pistols, 15 pull-ups", movements: ["handstand-push-up", "pistol", "pull-up"], defaultScoreType: "rounds_reps" },
  { name: "Nancy", slug: "nancy", prescription: "5 rounds for time: 400 m run, 15 overhead squats (95/65 lb)", movements: ["run", "overhead-squat"], defaultScoreType: "time" },
  { name: "Nicole", slug: "nicole", prescription: "20 min AMRAP: 400 m run, max-rep pull-ups", movements: ["run", "pull-up"], defaultScoreType: "reps" },
  { name: "Kelly", slug: "kelly", prescription: "5 rounds for time: 400 m run, 30 box jumps (24 in), 30 wall-ball shots (20 lb)", movements: ["run", "box-jump", "wall-ball"], defaultScoreType: "time" },
  { name: "Lynne", slug: "lynne", prescription: "5 rounds, no time component: max-rep bench press (bodyweight), max-rep pull-ups", movements: ["bench-press", "pull-up"], defaultScoreType: "reps" },
  { name: "Amanda", slug: "amanda", prescription: "9-7-5 reps for time: muscle-up, squat snatch (135/95 lb)", movements: ["ring-muscle-up", "squat-snatch"], defaultScoreType: "time" },
  { name: "Eva", slug: "eva", prescription: "5 rounds for time: 800 m run, 30 kettlebell swings (70/53 lb), 30 pull-ups", movements: ["run", "kettlebell-swing", "pull-up"], defaultScoreType: "time" },
  { name: "Christine", slug: "christine", prescription: "3 rounds for time: 500 m row, 12 bodyweight deadlifts, 21 box jumps (20 in)", movements: ["row", "deadlift", "box-jump"], defaultScoreType: "time" },
  { name: "Nasty Girls", slug: "nasty-girls", prescription: "3 rounds for time: 50 air squats, 7 muscle-ups, 10 hang power cleans (135/95 lb)", movements: ["air-squat", "ring-muscle-up", "hang-power-clean"], defaultScoreType: "time" },

  // --- heroes ---------------------------------------------------------------
  { name: "Murph", slug: "murph", prescription: "For time, wearing a 20/14 lb vest: 1 mile run, 100 pull-ups, 200 push-ups, 300 air squats, 1 mile run", movements: ["run", "pull-up", "push-up", "air-squat"], defaultScoreType: "time" },
  { name: "DT", slug: "dt", prescription: "5 rounds for time: 12 deadlifts, 9 hang power cleans, 6 push jerks (155/105 lb)", movements: ["deadlift", "hang-power-clean", "push-jerk"], defaultScoreType: "time" },
  { name: "Michael", slug: "michael", prescription: "3 rounds for time: 800 m run, 50 back extensions, 50 sit-ups", movements: ["run", "back-extension", "abmat-sit-up"], defaultScoreType: "time" },
  { name: "JT", slug: "jt", prescription: "21-15-9 reps for time: handstand push-up, ring dip, push-up", movements: ["handstand-push-up", "ring-dip", "push-up"], defaultScoreType: "time" },
  { name: "Randy", slug: "randy", prescription: "75 power snatches for time (75/55 lb)", movements: ["power-snatch"], defaultScoreType: "time" },
  { name: "Josh", slug: "josh", prescription: "For time: 21 overhead squats (95/65 lb), 42 pull-ups, 15 OHS, 30 pull-ups, 9 OHS, 18 pull-ups", movements: ["overhead-squat", "pull-up"], defaultScoreType: "time" },
  { name: "Danny", slug: "danny", prescription: "20 min AMRAP: 30 box jumps (24 in), 20 push presses (115/75 lb), 30 pull-ups", movements: ["box-jump", "push-press", "pull-up"], defaultScoreType: "rounds_reps" },
  { name: "Nate", slug: "nate", prescription: "20 min AMRAP: 2 muscle-ups, 4 handstand push-ups, 8 kettlebell swings (70/53 lb)", movements: ["ring-muscle-up", "handstand-push-up", "kettlebell-swing"], defaultScoreType: "rounds_reps" },
  { name: "Chad", slug: "chad", prescription: "1,000 box step-ups (20 in) for time, wearing a 45/35 lb ruck", movements: ["box-step-up"], defaultScoreType: "time" },
  { name: "Ryan", slug: "ryan", prescription: "5 rounds for time: 7 muscle-ups, 21 burpees", movements: ["ring-muscle-up", "burpee"], defaultScoreType: "time" },
  { name: "Hansen", slug: "hansen", prescription: "5 rounds for time: 30 kettlebell swings (70/53 lb), 30 burpees, 30 GHD sit-ups", movements: ["kettlebell-swing", "burpee", "ghd-sit-up"], defaultScoreType: "time" },
  { name: "Bull", slug: "bull", prescription: "2 rounds for time: 200 double-unders, 50 overhead squats (135/95 lb), 50 pull-ups, 1 mile run", movements: ["double-under", "overhead-squat", "pull-up", "run"], defaultScoreType: "time" },
  { name: "Glen", slug: "glen", prescription: "For time: 30 clean and jerks (135/95 lb), 1 mile run, 10 rope climbs, 1 mile run, 100 burpees", movements: ["clean-and-jerk", "run", "rope-climb", "burpee"], defaultScoreType: "time" },
  { name: "Jerry", slug: "jerry", prescription: "For time: 1 mile run, 2,000 m row, 1 mile run", movements: ["run", "row"], defaultScoreType: "time" },
  { name: "Tommy V", slug: "tommy-v", prescription: "For time: 21 thrusters (115/75 lb), 12 rope climbs (15 ft), 15 thrusters, 9 rope climbs, 9 thrusters, 6 rope climbs", movements: ["thruster", "rope-climb"], defaultScoreType: "time" },
  { name: "The Seven", slug: "the-seven", prescription: "7 rounds for time: 7 handstand push-ups, 7 thrusters (135/95 lb), 7 knees-to-elbows, 7 deadlifts (245/165 lb), 7 burpees, 7 kettlebell swings (70/53 lb), 7 pull-ups", movements: ["handstand-push-up", "thruster", "knees-to-elbows", "deadlift", "burpee", "kettlebell-swing", "pull-up"], defaultScoreType: "time" },
  { name: "Griff", slug: "griff", prescription: "For time: 800 m run, 400 m run backwards, 800 m run, 400 m run backwards", movements: ["run"], defaultScoreType: "time" },
  { name: "Manion", slug: "manion", prescription: "7 rounds for time: 400 m run, 29 back squats (135/95 lb)", movements: ["run", "back-squat"], defaultScoreType: "time" },
  { name: "Badger", slug: "badger", prescription: "3 rounds for time: 30 squat cleans (95/65 lb), 30 pull-ups, 800 m run", movements: ["squat-clean", "pull-up", "run"], defaultScoreType: "time" },
  { name: "Holleyman", slug: "holleyman", prescription: "30 rounds for time: 5 wall-ball shots (20/14 lb), 3 handstand push-ups, 1 power clean (225/155 lb)", movements: ["wall-ball", "handstand-push-up", "power-clean"], defaultScoreType: "time" },
  { name: "Wittman", slug: "wittman", prescription: "7 rounds for time: 15 kettlebell swings (53/35 lb), 15 power cleans (95/65 lb), 15 box jumps (24 in)", movements: ["kettlebell-swing", "power-clean", "box-jump"], defaultScoreType: "time" },

  // --- other classics -------------------------------------------------------
  { name: "Filthy Fifty", slug: "filthy-fifty", prescription: "For time, 50 reps each: box jump (24 in), jumping pull-up, kettlebell swing (35/26 lb), walking lunge, knees-to-elbows, push press (45/35 lb), back extension, wall-ball shot (20/14 lb), burpee, double-under", movements: ["box-jump", "jumping-pull-up", "kettlebell-swing", "walking-lunge", "knees-to-elbows", "push-press", "back-extension", "wall-ball", "burpee", "double-under"], defaultScoreType: "time" },
  { name: "Fight Gone Bad", slug: "fight-gone-bad", prescription: "3 rounds, 1 min at each station for max reps, 1 min rest: wall-ball (20/14 lb), sumo deadlift high pull (75/55 lb), box jump (20 in), push press (75/55 lb), row (calories)", movements: ["wall-ball", "sumo-deadlift-high-pull", "box-jump", "push-press", "row"], defaultScoreType: "reps" },
  { name: "The Chief", slug: "the-chief", prescription: "5 cycles of a 3 min AMRAP, resting 1 min between: 3 power cleans (135/95 lb), 6 push-ups, 9 air squats", movements: ["power-clean", "push-up", "air-squat"], defaultScoreType: "rounds_reps" },
  { name: "Tabata Something Else", slug: "tabata-something-else", prescription: "32 intervals of 20 s work, 10 s rest — 8 each of pull-up, push-up, sit-up, air squat. Score is total reps.", movements: ["pull-up", "push-up", "abmat-sit-up", "air-squat"], defaultScoreType: "reps" },
  { name: "CrossFit Total", slug: "crossfit-total", prescription: "Sum of best single: back squat, shoulder press, deadlift", movements: ["back-squat", "shoulder-press", "deadlift"], defaultScoreType: "load" },
  { name: "Death by Burpees", slug: "death-by-burpees", prescription: "EMOM, adding 1 burpee each minute, until failure", movements: ["burpee"], defaultScoreType: "reps" },
  { name: "Death by Pull-ups", slug: "death-by-pull-ups", prescription: "EMOM, adding 1 pull-up each minute, until failure", movements: ["pull-up"], defaultScoreType: "reps" },
];

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Rows for the movements table, both kinds, ready to insert. */
export function seedRows(): NewMovement[] {
  const fromMovements: NewMovement[] = MOVEMENTS.map((m) => ({
    name: m.name,
    slug: m.slug,
    kind: "movement",
    modality: m.modality,
    pattern: m.pattern,
    aliases: m.aliases ?? [],
    defaultScoreType: m.defaultScoreType ?? null,
    isCustom: false,
  }));

  const fromBenchmarks: NewMovement[] = BENCHMARKS.map((b) => ({
    name: b.name,
    slug: b.slug,
    kind: "benchmark",
    modality: null,
    pattern: null,
    aliases: [],
    defaultScoreType: b.defaultScoreType,
    prescription: b.prescription,
    isCustom: false,
  }));

  return [...fromMovements, ...fromBenchmarks];
}

/** slug -> component movement slugs, for auto-tagging a logged benchmark. */
export const BENCHMARK_COMPONENTS: Record<string, string[]> = Object.fromEntries(
  BENCHMARKS.map((b) => [b.slug, b.movements]),
);

/** Guard against typos in the component lists above. Run in a test. */
export function validateSeed(): string[] {
  const known = new Set(MOVEMENTS.map((m) => m.slug));
  const errors: string[] = [];
  for (const b of BENCHMARKS) {
    for (const slug of b.movements) {
      if (!known.has(slug)) errors.push(`${b.name}: unknown movement "${slug}"`);
    }
  }
  const slugs = [...MOVEMENTS, ...BENCHMARKS].map((m) => m.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length) errors.push(`duplicate slugs: ${[...new Set(dupes)].join(", ")}`);
  return errors;
}
