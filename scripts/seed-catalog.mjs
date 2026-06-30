/**
 * Catalog seed: uploads product + hero-banner images to Supabase Storage,
 * then inserts 36 products + 36 product_media rows.
 *
 * Requires a clean dev DB (no orders/carts referencing old demo rows).
 *
 * Run: node --env-file=.env scripts/seed-catalog.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- Env guard ---------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Bucket helper -----------------------------------------------------------
async function ensureBucket(name) {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error(`listBuckets failed: ${listErr.message}`);
    process.exit(1);
  }
  const exists = buckets.some((b) => b.name === name);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(name, {
      public: true,
      fileSizeLimit: "50MB",
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    if (error) {
      console.error(`createBucket "${name}" failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`created public bucket "${name}"`);
  } else {
    const { error } = await supabase.storage.updateBucket(name, { public: true });
    if (error) {
      console.error(`updateBucket "${name}" failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`bucket "${name}" already exists — re-asserted public`);
  }
}

await ensureBucket("product-images");
await ensureBucket("hero-banners");

// --- Category + name config --------------------------------------------------
const CATEGORIES = {
  Anklets:   "ANK",
  Bracelets: "BRC",
  Chains:    "CHN",
  Earrings:  "EAR",
  Necklaces: "NKL",
  Rings:     "RNG",
};

const NAME_OVERRIDES = {
  GoldChandbaliearrings:  "Gold Chandbali Earrings",
  Goldkandanearrings:     "Gold Kandan Earrings",
  goldenJumkaearrings:    "Gold Jumka Earrings",
  silverfallgrenearrings: "Silver Fallgren Earrings",
  silverhoopearrings:     "Silver Hoop Earrings",
  silverjhumkaearrings:   "Silver Jhumka Earrings",
  Goldtemplering:         "Gold Temple Ring",
  golddiamondring:        "Gold Diamond Ring",
  goldsignetring:         "Gold Signet Ring",
  silverfiligreering:     "Silver Filigree Ring",
  silveroxyring:          "Silver Oxy Ring",
  silverplainring:        "Silver Plain Ring",
};

function parseStem(stem) {
  let name;
  let words;
  if (stem.includes("_")) {
    words = stem.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    name = words.join(" ");
  } else {
    name = NAME_OVERRIDES[stem] ?? stem.charAt(0).toUpperCase() + stem.slice(1);
    words = [stem];
  }
  const prefix = words[0].toLowerCase();
  const material = prefix.startsWith("gold") ? "gold" : "silver";
  return { name, material };
}

// --- Upload hero banners -----------------------------------------------------
const heroDir = join(rootDir, "public", "images", "Hero_banner");
const heroFiles = (await readdir(heroDir)).filter((f) => f.endsWith(".png"));

for (const filename of heroFiles) {
  const body = await readFile(join(heroDir, filename));
  const { error } = await supabase.storage
    .from("hero-banners")
    .upload(filename, body, { contentType: "image/png", cacheControl: "31536000", upsert: true });
  if (error) {
    console.error(`hero upload failed for ${filename}: ${error.message}`);
    process.exit(1);
  }
  const { data } = supabase.storage.from("hero-banners").getPublicUrl(filename);
  console.log(`  ${filename}  ->  ${data.publicUrl}`);
}

// --- Upload product images + build accumulator -------------------------------
/** @type {Array<{sku: string, name: string, material: string, filename: string}>} */
const accumulator = [];

for (const [category, catCode] of Object.entries(CATEGORIES)) {
  const catDir = join(rootDir, "public", "images", category);
  const files = (await readdir(catDir)).filter((f) => f.endsWith(".png"));
  files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  for (let idx = 0; idx < files.length; idx++) {
    const filename = files[idx];
    const stem = filename.replace(/\.png$/i, "");
    const { name, material } = parseStem(stem);
    const sku = `NN-${catCode}-${String(idx + 1).padStart(3, "0")}`;

    const body = await readFile(join(catDir, filename));
    const { error } = await supabase.storage
      .from("product-images")
      .upload(filename, body, { contentType: "image/png", cacheControl: "31536000", upsert: true });
    if (error) {
      console.error(`product upload failed for ${filename}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  [${sku}] ${filename}  ->  ${name} (${material})`);

    accumulator.push({ sku, name, material, filename });
  }
}

if (accumulator.length !== 36) {
  console.error(`Expected 36 product files, found ${accumulator.length}`);
  process.exit(1);
}

// --- Clear existing data -----------------------------------------------------
const { error: delMediaErr } = await supabase
  .from("product_media")
  .delete()
  .not("id", "is", null);
if (delMediaErr) {
  console.error(`product_media delete failed: ${delMediaErr.message}`);
  process.exit(1);
}

const { error: delProdErr } = await supabase
  .from("products")
  .delete()
  .not("id", "is", null);
if (delProdErr) {
  console.error(
    `products delete failed: ${delProdErr.message}\nHint: FK violation — reservations still reference these products; run: DELETE FROM reservations WHERE product_id IN (SELECT id FROM products) then retry.`,
  );
  process.exit(1);
}

// --- Insert products ---------------------------------------------------------
const productsArray = accumulator.map(({ sku, name, material }) => {
  const isGold = material === "gold";
  return {
    sku,
    name,
    material,
    description: null,
    is_active: true,
    weight_grams: 10.0,
    purity_karat: isGold ? 22 : null,
    hallmark_huid: isGold ? "PENDING" : null,
    making_charge_type: isGold ? "percent" : "flat",
    making_charge_value: isGold ? 1200 : 50000,
    stock_quantity: 3,
  };
});

const { data: insertedProducts, error: insertProdErr } = await supabase
  .from("products")
  .insert(productsArray)
  .select("id, sku");
if (insertProdErr) {
  console.error(`products insert failed: ${insertProdErr.message}`);
  process.exit(1);
}

// --- Insert product_media ----------------------------------------------------
const skuToFilename = Object.fromEntries(accumulator.map(({ sku, filename }) => [sku, filename]));
const skuToName = Object.fromEntries(accumulator.map(({ sku, name }) => [sku, name]));

const mediaArray = insertedProducts.map(({ id: product_id, sku }) => {
  const filename = skuToFilename[sku];
  const { data } = supabase.storage.from("product-images").getPublicUrl(filename);
  return {
    product_id,
    url: data.publicUrl,
    alt_text: skuToName[sku],
    sort_order: 0,
    is_primary: true,
  };
});

const { error: insertMediaErr } = await supabase.from("product_media").insert(mediaArray);
if (insertMediaErr) {
  console.error(`product_media insert failed: ${insertMediaErr.message}`);
  process.exit(1);
}

// --- Self-check --------------------------------------------------------------
const { count: prodCount, error: prodCountErr } = await supabase
  .from("products")
  .select("id", { count: "exact", head: true });
if (prodCountErr) {
  console.error(`products count failed: ${prodCountErr.message}`);
  process.exit(1);
}
if (prodCount !== 36) {
  console.error(`MISMATCH: expected 36 products rows, got ${prodCount}`);
  process.exit(1);
}

const { count: mediaCount, error: mediaCountErr } = await supabase
  .from("product_media")
  .select("id", { count: "exact", head: true });
if (mediaCountErr) {
  console.error(`product_media count failed: ${mediaCountErr.message}`);
  process.exit(1);
}
if (mediaCount !== 36) {
  console.error(`MISMATCH: expected 36 product_media rows, got ${mediaCount}`);
  process.exit(1);
}

console.log("seed complete: 36 products + 36 product_media rows");
