export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q') || '';
  const venture = url.searchParams.get('venture') || '';
  const ventures = url.searchParams.get('ventures') || '';
  const provider = url.searchParams.get('provider') || '';
  const gameType = url.searchParams.get('gameType') || '';
  const platform = url.searchParams.get('platform') || '';
  const aggregator = url.searchParams.get('aggregator') || '';
  const winLineType = url.searchParams.get('winLineType') || '';
  const feature = url.searchParams.get('feature') || '';
  const theme = url.searchParams.get('theme') || '';
  const ventureList = venture ? [venture] : ventures ? ventures.split(',') : [];

  // Case-insensitive compare helper: lowercase + trim both sides.
  const norm = s => (s || '').toLowerCase().trim();

  if (!query && !ventureList.length && !provider && !gameType && !platform && !aggregator && !winLineType && !feature && !theme) {
    return new Response(JSON.stringify({ results: [], error: 'No filters provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const token = context.env.CONTENTFUL_TOKEN;
    const spaceId = 'nw2595tc1jdx';
    const baseUrl = `https://api.contentful.com/spaces/${spaceId}/environments/master/entries`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const PROVIDER_VARIANTS = {
      'Area Vegas': ['Area Vegas', 'AreaVegas Games'],
      'Aristocrat Interactive': ['Aristocrat', 'Aristocrat Interactive'],
      'Barstruck': ['Bar-Xstruck', 'Barstruck'],
      'Games Global': ['Games Global', 'Games Global (GGL)', 'Games Global Portfolio'],
      'Just for The Win Studios': ['Just For The Win Studios', 'Just for The Win Studios'],
      'Pragmatic Play': ['Pragmatic Play', 'PragmaticPlay'],
      'Yggdrasil': ['YGG Drasil', 'Yggdrasil'],
    };

    // Step 1: Fetch ALL cashier entries (paginated). A game counts if it is live OR pp (staging).
    let cashierParams = `content_type=cashierGameConfig`;
    if (ventureList.length === 1) cashierParams += `&fields.ventures=${encodeURIComponent(ventureList[0])}`;
    if (gameType) cashierParams += `&fields.gameType=${encodeURIComponent(gameType)}`;

    const cashierLookup = {};
    let cashierSkip = 0;
    const cashierLimit = 200;

    while (true) {
      const cashierRes = await fetch(`${baseUrl}?${cashierParams}&limit=${cashierLimit}&skip=${cashierSkip}`, { headers });
      const cashierData = cashierRes.ok ? await cashierRes.json() : { items: [], total: 0 };
      const items = cashierData.items || [];
      const total = cashierData.total || 0;

      for (const item of items) {
        const f = item.fields || {};
        const g = k => f[k] && (f[k]['en-GB'] !== undefined ? f[k]['en-GB'] : f[k]);
        const name = g('gameName');
        const ppYes = Array.isArray(g('pp')) ? g('pp').includes('yes') : false;
        const liveYes = Array.isArray(g('live')) ? g('live').includes('yes') : false;
        if (name && (liveYes || ppYes)) {
          cashierLookup[name.toUpperCase()] = {
            gameId: g('gameId') || '',
            gameName: name,
            skinName: g('gameSkinName') || '',
            productName: g('gameProductName') || '',
            ventures: g('ventures') || [],
            w2gReportable: g('w2gReportable') ?? false,
            groupCompliant: g('groupCompliant') ?? false,
            miniGame: g('miniGame') ?? false,
            progressive: g('progressive') ?? false,
            integration: Array.isArray(g('integration')) ? g('integration').includes('yes') : false,
            pp: ppYes,
            live: liveYes,
            entryId: item.sys?.id || ''
          };
        }
      }

      cashierSkip += cashierLimit;
      if (cashierSkip >= total) break;
    }

    // If multiple ventures passed, filter cashierLookup to only those ventures
    let filteredLookup = cashierLookup;
    if (ventureList.length > 1) {
      filteredLookup = {};
      for (const [name, entry] of Object.entries(cashierLookup)) {
        if (entry.ventures && entry.ventures.some(v => ventureList.includes(v))) {
          filteredLookup[name] = entry;
        }
      }
    }
    const liveGameNames = new Set(Object.keys(filteredLookup));

    if (liveGameNames.size === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Step 2: Fetch ALL matching gameV2 entries (paginated).
    // NOTE: the Game Name query is NOT sent to Contentful full-text (that matches descriptions too,
    // e.g. games that merely mention "superlinks"). It is matched against title/entryTitle below.
    let gameParams = `content_type=gameV2`;
    if (platform) gameParams += `&fields.platformVisibility=${encodeURIComponent(platform)}`;

    const providerVariants = provider ? (PROVIDER_VARIANTS[provider] || [provider]) : null;
    const nameQuery = norm(query);

    const allGameItems = [];
    let gameSkip = 0;
    const gameLimit = 200;

    while (true) {
      const gameRes = await fetch(`${baseUrl}?${gameParams}&limit=${gameLimit}&skip=${gameSkip}`, { headers });
      const gameData = gameRes.ok ? await gameRes.json() : { items: [], total: 0 };
      const items = gameData.items || [];
      const total = gameData.total || 0;

      allGameItems.push(...items);
      gameSkip += gameLimit;
      if (gameSkip >= total) break;
    }

    // Step 3: Cross reference and build results
    const results = [];

    for (const item of allGameItems) {
      try {
        const f = item.fields || {};
        const config = (f.gamePlatformConfig && (f.gamePlatformConfig['en-GB'] || f.gamePlatformConfig)) || {};
        const gameTypeObj = config.gameType || {};
        const entryTitle = (f.entryTitle && (f.entryTitle['en-GB'] || f.entryTitle)) || '';
        const title = (f.title && (f.title['en-GB'] || f.title)) || '';
        const studio = config.gameStudio || config.gameProvider || '';
        const launchName = config.name || config.n || (config.realUrl || '').split('/play/')[1] || entryTitle;

        // Filter by game name: match title or entryTitle only (not description)
        if (nameQuery) {
          if (!norm(title).includes(nameQuery) && !norm(entryTitle).includes(nameQuery)) continue;
        }

        // Filter by provider variants
        if (providerVariants) {
          if (!providerVariants.includes(studio)) continue;
        }

        // Filter by aggregator
        if (aggregator) {
          const aggVariants = PROVIDER_VARIANTS[aggregator] || [aggregator];
          if (!aggVariants.includes(config.gameAggregator || '')) continue;
        }

        // Filter by win line type (case-insensitive)
        if (winLineType) {
          if (norm(gameTypeObj.winLineType) !== norm(winLineType)) continue;
        }

        // Filter by feature (case-insensitive)
        if (feature) {
          if (!(gameTypeObj.features || []).some(x => norm(x) === norm(feature))) continue;
        }

        // Filter by theme (case-insensitive)
        if (theme) {
          if (!(gameTypeObj.themes || []).some(x => norm(x) === norm(theme))) continue;
        }

        // Only include if matched in cashier live list
        if (!liveGameNames.has(entryTitle.toUpperCase())) continue;

        const cashier = filteredLookup[entryTitle.toUpperCase()] || null;
        const intro = (f.introductionContent && (f.introductionContent['en-GB'] || f.introductionContent)) || '';
        const excerpt = typeof intro === 'string' ? intro.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        const platformRaw = f.platformVisibility && (f.platformVisibility['en-GB'] || f.platformVisibility);
        const platformArr = Array.isArray(platformRaw) ? platformRaw : (config.platform || []);

        results.push({
          title,
          entryTitle,
          excerpt,
          provider: studio,
          gameStudio: config.gameStudio || '',
          gameAggregator: config.gameAggregator || '',
          gameType: gameTypeObj.type || '',
          subGameType: config.subGameType || '',
          contractGameType: config.contractGameType || '',
          features: gameTypeObj.features || [],
          themes: gameTypeObj.themes || [],
          rtp: config.rtp || '',
          reel: gameTypeObj.reel || '',
          winLines: gameTypeObj.winLines || '',
          paylines: gameTypeObj.winLines || '',
          maxMultiplier: gameTypeObj.maxMultiplier || '',
          maxWin: gameTypeObj.maxExposure || '',
          progressiveJackpot: (f.progressiveJackpot && (f.progressiveJackpot['en-GB'] ?? f.progressiveJackpot)) ?? false,
          volatility: gameTypeObj.volatility || '',
          waysToWin: gameTypeObj.waysToWin || '',
          winLineType: gameTypeObj.winLineType || '',
          platform: platformArr,
          demoUrl: config.demoUrl || '',
          realUrl: config.realUrl || '',
          infoDetails: (f.infoDetails && (f.infoDetails['en-GB'] || f.infoDetails)) || '',
          entryId: item.sys?.id || '',
          launchName,
          cashierConfig: cashier
        });
      } catch(e) {
        continue;
      }
    }

    // Collapse per-venture skins (bingo) into one row per game, keyed by launch name.
    // Slots have a unique launch name each, so they pass through unchanged.
    const byLaunch = new Map();
    for (const r of results) {
      const key = r.launchName || r.entryTitle;
      if (!byLaunch.has(key)) byLaunch.set(key, Object.assign({}, r, { ventures: [] }));
      const g = byLaunch.get(key);
      const vs = (r.cashierConfig && r.cashierConfig.ventures) || [];
      for (const v of vs) if (!g.ventures.includes(v)) g.ventures.push(v);
      // Keep the plainest (shortest) display title, e.g. "Superlinks" over "Superlinks Rainbow Riches".
      if ((r.title || '').length && (!g.title || (r.title || '').length < g.title.length)) g.title = r.title;
    }
    const deduped = Array.from(byLaunch.values());
    // Reflect the merged venture list back into cashierConfig so the detail panel lists them all.
    for (const g of deduped) {
      if (g.cashierConfig) g.cashierConfig = Object.assign({}, g.cashierConfig, { ventures: g.ventures });
    }
    deduped.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return new Response(JSON.stringify({ results: deduped, total: deduped.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
