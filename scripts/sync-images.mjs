import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DATA_ROOT = path.resolve('src/data');
const USER_AGENT =
  'TheGamersMeridianBot/1.0 (https://github.com/musman-uk; personal-atlas-project)';

const FORCE_REFRESH = process.argv.includes('--force');
const GAME_FILTER = process.argv
  .find((arg) => arg.startsWith('--game='))
  ?.split('=')[1]
  ?.trim()
  .toLowerCase();

const EXCLUDE_TITLE_REGEX =
  /\b(map|flag|coat[ _]of[ _]arms|logo|diagram|plan|seal|coin|stamp|plaque|locator|svg)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(text) {
  return String(text || 'waypoint')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanMetadataText(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPhotoCredit(ext = {}) {
  const customAttribution = cleanMetadataText(ext.Attribution?.value);
  const artist = cleanMetadataText(ext.Artist?.value);
  const license = cleanMetadataText(ext.LicenseShortName?.value);

  const author = customAttribution || artist;

  if (author && license) {
    return author.toLowerCase().includes(license.toLowerCase())
      ? author
      : `${author} / ${license}`;
  }
  if (author) return `${author} / Wikimedia Commons`;
  if (license) return `${license} / Wikimedia Commons`;
  return 'Wikimedia Commons';
}

function fileExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function findJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function fetchWithRetry(url, options = {}, attempt = 1) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.headers || {})
    }
  });

  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const waitMs = attempt * 5000;
    console.log(`  Wikimedia throttled (${res.status}), waiting ${waitMs / 1000}s before retry...`);
    await sleep(waitMs);
    return fetchWithRetry(url, options, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return res;
}

function rankCandidates(pages) {
  if (!pages) return [];

  return Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      return {
        title: page.title || '',
        url: info.thumburl || info.url,
        width: info.width || 0,
        height: info.height || 0,
        mime: info.mime || '',
        credit: formatPhotoCredit(info.extmetadata)
      };
    })
    .filter(Boolean)
    .filter((item) => {
      if (!/^image\/(jpeg|png|webp)$/i.test(item.mime)) return false;
      if (EXCLUDE_TITLE_REGEX.test(item.title)) return false;
      if (item.width < 950 || item.height < 520) return false;
      const ratio = item.width / item.height;
      return ratio >= 1.2 && ratio <= 2.4;
    })
    .sort((a, b) => {
      const diffA = Math.abs(a.width / a.height - 1.6);
      const diffB = Math.abs(b.width / b.height - 1.6);
      return diffA - diffB;
    })
    .slice(0, 4);
}

async function fetchWikipediaLeadCandidates(query) {
  try {
    const wpParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '3',
      prop: 'pageimages',
      piprop: 'name',
      format: 'json'
    });

    const wpRes = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${wpParams}`, {
      headers: { Accept: 'application/json' }
    });
    const wpData = await wpRes.json();
    const pages = Object.values(wpData?.query?.pages || {});
    const fileTitles = [
      ...new Set(
        pages
          .map((p) => p.pageimage)
          .filter(Boolean)
          .map((name) => `File:${name}`)
      )
    ];

    if (fileTitles.length === 0) return [];

    const commonsParams = new URLSearchParams({
      action: 'query',
      titles: fileTitles.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|Attribution',
      iiurlwidth: '1280',
      format: 'json'
    });

    const commonsRes = await fetchWithRetry(
      `https://commons.wikimedia.org/w/api.php?${commonsParams}`,
      { headers: { Accept: 'application/json' } }
    );
    const commonsData = await commonsRes.json();
    return rankCandidates(commonsData?.query?.pages);
  } catch {
    return [];
  }
}

async function searchCommonsText(searchQuery) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${searchQuery} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '15',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName|Attribution',
    iiurlwidth: '1280',
    format: 'json'
  });

  const res = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { Accept: 'application/json' }
  });
  const data = await res.json();
  return rankCandidates(data?.query?.pages);
}

async function searchWikimedia(loc, fallbackCoords = null) {
  const customQuery = (loc.photoQuery || '').trim();
  const city = (loc.city || '').trim();
  const modern = (loc.modernLocation || '').trim();

  const basePlace =
    modern && city && !modern.toLowerCase().includes(city.toLowerCase())
      ? `${city} ${modern}`
      : modern || city;

  const queries = customQuery
    ? [customQuery]
    : [...new Set([basePlace, city].filter(Boolean))];

  // 1. Wikipedia human-curated article lead image
  for (const q of queries) {
    const wpCandidates = await fetchWikipediaLeadCandidates(q);
    if (wpCandidates.length > 0) return wpCandidates;
  }

  // 2. Commons file search (prefers historic/landmark views if no custom photoQuery is set)
  const commonsQueries = customQuery
    ? [customQuery]
    : [...new Set([`${basePlace} historic`, basePlace, city].filter(Boolean))];

  for (const q of commonsQueries) {
    const candidates = await searchCommonsText(q);
    if (candidates.length > 0) return candidates;
  }

  // 3. Tightened 1.5km geosearch around coordinates
  const coords = loc.coordinates || fallbackCoords;
  const lat = Array.isArray(coords) ? coords[0] : coords?.lat;
  const lng = Array.isArray(coords) ? coords[1] : coords?.lng;

  if (typeof lat === 'number' && typeof lng === 'number') {
    const geoParams = new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${lat}|${lng}`,
      ggsradius: '1500',
      ggsnamespace: '6',
      ggslimit: '15',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|Attribution',
      iiurlwidth: '1280',
      format: 'json'
    });

    const geoRes = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${geoParams}`, {
      headers: { Accept: 'application/json' }
    });
    const geoData = await geoRes.json();
    const geoCandidates = rankCandidates(geoData?.query?.pages);
    if (geoCandidates.length > 0) return geoCandidates;
  }

  return [];
}

async function processEntry(entry, game, gameDir, filePath, parsedRoot, fallbackCoords = null) {
  const currentPhoto = (entry.photo || '').trim();

  if (/^https?:\/\//i.test(currentPhoto)) {
    console.log(`✓ Skipping "${entry.city}" (keeping external URL)`);
    return false;
  }

  if (!FORCE_REFRESH && currentPhoto) {
    const cleanRel = currentPhoto.replace(/^\.?\//, '');
    const existingPath = path.resolve(gameDir, cleanRel);
    if (await fileExists(existingPath)) {
      console.log(`✓ Skipping "${entry.city}" (local image already exists)`);
      return false;
    }
  }

  const searchLabel = entry.photoQuery ? `${entry.city} [query: "${entry.photoQuery}"]` : entry.city;
  console.log(`✦ Searching Wikimedia for "${searchLabel}" (${game.title})...`);
  const candidates = await searchWikimedia(entry, fallbackCoords);

  if (candidates.length === 0) {
    console.warn(`⚠ No suitable landscape photo found for "${entry.city}". Leaving blank.`);
    return false;
  }

  const gameFolder = slugify(game.id || path.basename(gameDir));
  const imagesDir = path.join(gameDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  const fileId = slugify(entry.id || `${gameFolder}-${entry.city}`);
  const filename = `${fileId}.webp`;
  const outPath = path.join(imagesDir, filename);

  let savedCandidate = null;
  for (const candidate of candidates) {
    try {
      const imgRes = await fetchWithRetry(candidate.url);
      const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

      await sharp(rawBuffer)
        .resize(1200, 750, { fit: 'cover', position: 'attention' })
        .webp({ quality: 84 })
        .toFile(outPath);

      savedCandidate = candidate;
      break;
    } catch (err) {
      console.warn(`  Candidate failed (${candidate.title}): ${err.message}, trying next...`);
    }
  }

  if (!savedCandidate) {
    console.warn(`⚠ All image downloads failed for "${entry.city}". Leaving blank.`);
    return false;
  }

  entry.photo = `images/${filename}`;
  entry.photoCredit = savedCandidate.credit;

  await fs.writeFile(filePath, JSON.stringify(parsedRoot, null, 2) + '\n', 'utf8');
  console.log(
    `  Saved -> ${path.relative(process.cwd(), outPath)} [${savedCandidate.title}] (${savedCandidate.credit})`
  );

  await sleep(1500);
  return true;
}

async function syncFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const games = Array.isArray(parsed) ? parsed : [parsed];
  const gameDir = path.dirname(filePath);

  let updatedCount = 0;

  for (const game of games) {
    if (!game || !Array.isArray(game.locations)) continue;

    const gameSlug = slugify(game.id || path.basename(gameDir));
    if (GAME_FILTER && gameSlug !== GAME_FILTER) continue;

    for (const loc of game.locations) {
      if (Array.isArray(loc.subLocations) && loc.subLocations.length > 0) {
        for (const sub of loc.subLocations) {
          if (await processEntry(sub, game, gameDir, filePath, parsed, loc.coordinates)) {
            updatedCount++;
          }
        }
      } else {
        if (await processEntry(loc, game, gameDir, filePath, parsed)) {
          updatedCount++;
        }
      }
    }
  }

  return updatedCount;
}

async function main() {
  if (!(await fileExists(DATA_ROOT))) {
    throw new Error(`Data directory not found: ${DATA_ROOT}`);
  }

  const jsonFiles = await findJsonFiles(DATA_ROOT);
  let totalUpdated = 0;

  for (const file of jsonFiles) {
    totalUpdated += await syncFile(file);
  }

  console.log(
    totalUpdated > 0
      ? `\nSynced ${totalUpdated} postcard photo(s) from Wikimedia Commons.`
      : '\nAll postcards already have photos. Use --force to re-download.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
