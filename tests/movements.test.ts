import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveMovements } from "../db/queries";
import { movements } from "../db/schema";
import { buildExportDoc } from "../lib/export";
import { createCustomMovement, slugify, tidyName, uniqueSlug } from "../lib/movements";
import { inputsFor } from "../lib/inputs";
import { makeTestDb, seedMovements } from "./helpers";

let db: any;

beforeEach(async () => {
  ({ db } = makeTestDb(false));
  await seedMovements(db);
});

describe("slugify", () => {
  it("handles what a coach actually types", () => {
    expect(slugify("Burpee Pull-up")).toBe("burpee-pull-up");
    expect(slugify("Devil's Press")).toBe("devil-s-press");
    expect(slugify("  DB  Snatch  ")).toBe("db-snatch");
    expect(slugify("Sandbag over shoulder!!")).toBe("sandbag-over-shoulder");
  });

  it("never produces leading or trailing dashes", () => {
    expect(slugify("--weird--")).toBe("weird");
    expect(slugify("!!!")).toBe("");
  });
});

describe("tidyName", () => {
  it("tidies without mangling shorthand", () => {
    expect(tidyName("  burpee   pull-ups ")).toBe("Burpee pull-ups");
    expect(tidyName("DB snatch")).toBe("DB snatch");
  });
});

describe("uniqueSlug", () => {
  it("suffixes rather than colliding with a seeded movement", async () => {
    expect(await uniqueSlug(db, "burpee")).toBe("burpee-2");
  });

  it("leaves a free slug alone", async () => {
    expect(await uniqueSlug(db, "burpee-pull-up")).toBe("burpee-pull-up");
  });
});

describe("creating a custom movement", () => {
  it("adds one that the seed never heard of", async () => {
    const created = await createCustomMovement(db, "burpee pull-ups", "load");
    expect(created?.name).toBe("Burpee pull-ups");
    expect(created?.slug).toBe("burpee-pull-ups");
    expect(created?.isCustom).toBe(true);
    expect(created?.kind).toBe("movement");
  });

  it("is findable by search immediately", async () => {
    await createCustomMovement(db, "Burpee Pull-up", "load");
    const hits = await resolveMovements(db, "burpee pull");
    expect(hits.map((m: any) => m.name)).toContain("Burpee Pull-up");
  });

  it("drives the right fields on the log form", async () => {
    const reps = await createCustomMovement(db, "Devil press variant", "load");
    const dist = await createCustomMovement(db, "Sled drag", "distance");
    expect(inputsFor(reps!)).toEqual(["reps", "load"]);
    expect(inputsFor(dist!)).toEqual(["distance", "calories"]);
  });

  it("reuses an existing movement rather than duplicating it", async () => {
    // Typing "burpee" when Burpee is already seeded must not create a second.
    const again = await createCustomMovement(db, "burpee", "load");
    expect(again?.isCustom).toBe(false);
    const all = await db.select().from(movements).where(eq(movements.slug, "burpee"));
    expect(all).toHaveLength(1);
  });

  it("does not collide when two customs share a root name", async () => {
    const a = await createCustomMovement(db, "Sled drag", "distance");
    await db.update(movements).set({ name: "renamed" }).where(eq(movements.id, a!.id));
    const b = await createCustomMovement(db, "Sled drag", "distance");
    expect(b!.slug).toBe("sled-drag-2");
  });

  it("refuses an empty name", async () => {
    expect(await createCustomMovement(db, "   ", "load")).toBeNull();
  });

  it("is carried by the backup, which would not rebuild without it", async () => {
    await createCustomMovement(db, "Burpee Pull-up", "load");
    const doc = await buildExportDoc(db);
    expect(doc.customMovements.map((m) => m.name)).toEqual(["Burpee Pull-up"]);
    // The 156 seeded rows stay out of the file.
    expect(doc.counts.customMovements).toBe(1);
  });
});
