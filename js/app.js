(() => {
  // --- Supabase Config ---
  const SUPABASE_URL = "https://yxcojyrizmoezmnagtuj.supabase.co";
  const SUPABASE_KEY = "sb_publishable_T5nT7uMC-V2i8ZJMl7xBEg_szeVe0yU";

  if (!SUPABASE_KEY) {
    console.error("Supabase API Key manquante !");
    alert("ERREUR : Clé API Supabase manquante dans le code (app.js ligne 4).");
  }

  const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  // --- Static Data ---
  const OBS_OPTIONS = ["Alimentation", "Boitier", "Bsod", "Cable", "Carte Graphique", "Carte Mere", "Erreur Burn", "Freeze", "IO Shield", "Led", "Nvme", "Pièce", "Problème déploiement", "Problème module", "Ram", "Support CG", "Ventilateur", "Watercooling"];
  const CAUSE_OPTIONS = ["Black Screen", "Cassé", "Coupé", "CPU", "Hors Service", "Mal installé", "Manquant", "Non branché", "Pas de signal", "Pâte Thermique", "Plastique", "RAM", "Rayures", "VGA", "Vis Manquante"];

  const BIOS_RULES = {
    "CBT071-03": "Regler Sys_fan à 80% et 9,96V Sys_Fan 1",
    "CBT083-01": "Regler Sys_fan à 80% et 9,96V Sys_Fan 1",
    "CBT070-01": "Regler Sys_fan à 80% et 9,96V Sys_Fan 1",
    "BF01": "Régler Sys_fan en PWM et activer le Smart Fan Mode",
    "BF06": "Désactiver PCIE Native Power Management  + Régler Sys_fan en PWM et activer le Smart Fan Mode",
    "BF08": "Désactiver PCIE Native Power Management ",
    "GLORY V3": "Régler Sys_fan3_Pump en mode CPU et désactiver app center",
    "ATLAS": "Désactiver PCIE Native Power Management",
    "VEESION": "Désactiver Trust Computing (TPM), désactiver Secure boot, mettre State After G3 (Power On after Failure) : S0 State",
    "VATECH": "Changer la date dans le Bios à début 2024",
    "YNOV": "Changer la date dans le Bios à début 2024",
    "GLADIATOR": "Régler Sys_fan à 80% et 9,96V Sys_Fan 2",
    "HUNTER": "Régler Sys_fan à 80% et 9,96V Sys_Fan 2",
    "EVA": "Activer l'option Wake on LAN : https://www.msi.com/support/technical_details/MB_Wake_On_LAN",
  };

  const normLot = (s) => String(s || "").trim().toUpperCase();
  const biosNoteForLot = (lotName) => BIOS_RULES[normLot(lotName)] || "";

  const DEFAULT_DEPLOY_MIN = 35;
  const DEFAULT_BURN_LINEUP = 30;
  const DEFAULT_BURN_BTO = 60;

  const localISODate = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getISOWeekNumber = (dateObj) => {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  };

  const weekFromISODate = (iso) => {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return String(getISOWeekNumber(d));
  };

  // --- State Model ---
  // On garde une structure locale identique pour l'UI, mais peuplée via Supabase
  let state = {
    carts: [],
    logsByDay: { [localISODate()]: [] },
  };

  // --- API Actions ---
  // Ces fonctions remplacent les manipulations directes de 'state' + saveState()

  const fetchState = async () => {
    if (!supabase) return;
    document.body.style.cursor = "wait";

    // 1. Carts & PCs
    const { data: cartsData, error: cartsErr } = await supabase
      .from("carts")
      .select("*, pcs(*)");

    if (cartsErr) { console.error(cartsErr); alert("Erreur chargement chariots"); }

    // 2. Logs (du jour)
    const today = localISODate();
    const { data: logsData, error: logsErr } = await supabase
      .from("logs")
      .select("*")
      .eq("log_date", today)
      .order("created_at", { ascending: false });

    if (logsErr) { console.error(logsErr); }

    // Reconstruct local state
    state.carts = (cartsData || []).map(c => ({
      id: c.id,
      name: c.name,
      position: c.position,
      lotType: c.lot_type,
      lotName: c.lot_name,
      deployMinutes: c.deploy_minutes,
      burnMinutes: c.burn_minutes,
      pcs: (c.pcs || []).sort((a, b) => a.slot_idx - b.slot_idx).map(pc => ({
        id: pc.id, // DB primary key
        idx: pc.slot_idx,
        sn: pc.sn,
        monteur: pc.monteur,
        problem: pc.problem,
        problemTag: pc.problem_tag,
        problemStatus: pc.problem_status
      }))
    }));

    // Logs map
    state.logsByDay[today] = (logsData || []).map(l => ({
      ...l.details, // spread json details
      id: l.id,
      date: l.log_date,
      week: l.week,
      type: l.type,
      monteur: l.monteur,
      sn: l.sn,
      lot: l.lot,
      cartNo: l.cart_no,
      place: l.place,
    }));

    document.body.style.cursor = "default";
    renderAll();
  };

  const apiCreateCart = async (cartObj) => {
    if (!supabase) return;
    // 1. Insert cart
    const { data: cData, error: cErr } = await supabase
      .from("carts")
      .insert([{
        name: cartObj.name,
        lot_type: cartObj.lotType,
        lot_name: cartObj.lotName,
        position: cartObj.position,
        deploy_minutes: cartObj.deployMinutes,
        burn_minutes: cartObj.burnMinutes
      }])
      .select()
      .single();

    if (cErr) { alert("Erreur création chariot"); console.error(cErr); return; }

    const newCartId = cData.id;

    // 2. Insert PCs
    const pcsRows = cartObj.pcs.map(pc => ({
      cart_id: newCartId,
      slot_idx: pc.idx,
      sn: pc.sn,
      monteur: pc.monteur,
      problem: pc.problem,
      problem_tag: pc.problemTag || "",
      problem_status: pc.problemStatus || ""
    }));

    const { error: pErr } = await supabase.from("pcs").insert(pcsRows);
    if (pErr) console.error(pErr);

    await fetchState();
  };

  const apiDeleteCart = async (cartId) => {
    if (!supabase) return;
    if (!confirm("Supprimer ce chariot ?")) return;

    const { error } = await supabase.from("carts").delete().eq("id", cartId);
    if (error) { alert("Erreur suppression"); console.error(error); return; }

    await fetchState();
  };

  const apiSetCartPosition = async (cartId, pos) => {
    if (!supabase) return;
    const { error } = await supabase.from("carts").update({ position: pos }).eq("id", cartId);
    if (error) { alert("Erreur placement"); console.error(error); return; }
    await fetchState();
  };

  const apiClearPosition = async (pos) => {
    if (!supabase) return;
    // find cart at pos
    const { error } = await supabase.from("carts").update({ position: null }).eq("position", pos);
    if (error) console.error(error);
    await fetchState();
  };

  const apiResetAllPositions = async () => {
    if (!supabase) return;
    const { error } = await supabase.from("carts").update({ position: null }).not("position", "is", null);
    if (error) console.error(error);
    await fetchState();
  };

  // Debounce maps for PC updates
  let pcUpdateTimeouts = {};

  const apiUpdatePc = (pcId, fields) => {
    if (!supabase) return;
    // Optimistic update locally? (Assuming we have ref to the object, but here we pass ID)
    // For simplicity: just fire update and re-fetch later? 
    // Or Debounce.

    if (pcUpdateTimeouts[pcId]) clearTimeout(pcUpdateTimeouts[pcId]);

    pcUpdateTimeouts[pcId] = setTimeout(async () => {
      // Mapping fields to snake_case
      const payload = {};
      if ("sn" in fields) payload.sn = fields.sn;
      if ("monteur" in fields) payload.monteur = fields.monteur;
      if ("problem" in fields) payload.problem = fields.problem;
      if ("problemStatus" in fields) payload.problem_status = fields.problemStatus;
      if ("problemTag" in fields) payload.problem_tag = fields.problemTag;

      const { error } = await supabase.from("pcs").update(payload).eq("id", pcId);
      if (error) console.error("Error updating PC", error);
      delete pcUpdateTimeouts[pcId];
      // Note: we don't fetchState() here to avoid killing input focus with a render
      // But we should eventually sync. For now, rely on local state updates done by callers + silent DB update.
    }, 1000);
  };

  const apiAddLog = async (logData) => {
    if (!supabase) return;
    // Separate main cols from details
    const { type, week, date, monteur, sn, lot, cartNo, place, ...rest } = logData;

    const { error } = await supabase.from("logs").insert([{
      log_date: date,
      week: Number(week) || null,
      type,
      monteur,
      sn,
      lot,
      cart_no: cartNo,
      place,
      details: rest // jsonb
    }]);

    if (error) console.error("Error adding log", error);
    await fetchState();
  };

  const apiClearLogsToday = async () => {
    if (!supabase) return;
    const today = localISODate();
    const { error } = await supabase.from("logs").delete().eq("log_date", today);
    if (error) console.error(error);
    await fetchState();
  };


  // --- DOM ---
  const leftSockets = document.getElementById("leftSockets");
  const rightSockets = document.getElementById("rightSockets");
  const unplacedList = document.getElementById("unplacedList");

  const btnAddCart = document.getElementById("btnAddCart");
  const btnResetPos = document.getElementById("btnResetPos");
  const btnToggleLeft = document.getElementById("btnToggleLeft"); // Toggle left card
  const centerDateTime = document.getElementById("centerDateTime");

  const logsEl = document.getElementById("logs");
  const logCount = document.getElementById("logCount");
  const btnCopyLogs = document.getElementById("btnCopyLogs");
  const btnClearLogs = document.getElementById("btnClearLogs");

  // Add cart modal
  const addCartModal = document.getElementById("addCartModal");
  const acCancel = document.getElementById("acCancel");
  const acSave = document.getElementById("acSave");
  const acName = document.getElementById("acName");
  const acLotWrap = document.getElementById("acLotWrap");
  const acLot = document.getElementById("acLot");
  const acDeploy = document.getElementById("acDeploy");
  const acBurn = document.getElementById("acBurn");
  const acBulk = document.getElementById("acBulk");

  // Add cart custom type dropdown
  const acTypeBtn = document.getElementById("acTypeBtn");
  const acTypeMenu = document.getElementById("acTypeMenu");
  const acTypeLabel = document.getElementById("acTypeLabel");
  let acTypeValue = "LINEUP";

  // Add cart custom socket dropdown
  const acSocketBtn = document.getElementById("acSocketBtn");
  const acSocketMenu = document.getElementById("acSocketMenu");
  const acSocketLabel = document.getElementById("acSocketLabel");
  let acSocketValue = "";

  // Assign modal (native select OK)
  const assignModal = document.getElementById("assignModal");
  const asSub = document.getElementById("asSub");
  const asCancel = document.getElementById("asCancel");
  const asSave = document.getElementById("asSave");
  const asSelect = document.getElementById("asSelect");
  let assignTargetSocket = null;

  // Cart modal
  const cartModal = document.getElementById("cartModal");
  const cartTitle = document.getElementById("cartTitle");
  const cartSub = document.getElementById("cartSub");
  const pcGrid = document.getElementById("pcGrid");
  const btnCartClose = document.getElementById("btnCartClose");
  let openCartId = null;

  // Problem modal (NEW fields)
  const problemModal = document.getElementById("problemModal");
  const pmSub = document.getElementById("pmSub");
  const pmCancel = document.getElementById("pmCancel");
  const pmSave = document.getElementById("pmSave");

  const pmWeek = document.getElementById("pmWeek");
  const pmDate = document.getElementById("pmDate");
  const pmMonteur = document.getElementById("pmMonteur");
  const pmSn = document.getElementById("pmSn");
  const pmLot = document.getElementById("pmLot");
  const pmCartNo = document.getElementById("pmCartNo");
  const pmPlace = document.getElementById("pmPlace");
  const pmComment = document.getElementById("pmComment");

  // Problem fake-selects
  const pmTypeBtn = document.getElementById("pmTypeBtn");
  const pmTypeMenu = document.getElementById("pmTypeMenu");
  const pmTypeLabel = document.getElementById("pmTypeLabel");

  const pmErrBtn = document.getElementById("pmErrBtn");
  const pmErrMenu = document.getElementById("pmErrMenu");
  const pmErrLabel = document.getElementById("pmErrLabel");

  const pmObsBtn = document.getElementById("pmObsBtn");
  const pmObsMenu = document.getElementById("pmObsMenu");
  const pmObsLabel = document.getElementById("pmObsLabel");
  const pmObsFreeWrap = document.getElementById("pmObsFreeWrap");
  const pmObsFree = document.getElementById("pmObsFree");

  const pmCauseBtn = document.getElementById("pmCauseBtn");
  const pmCauseMenu = document.getElementById("pmCauseMenu");
  const pmCauseLabel = document.getElementById("pmCauseLabel");
  const pmCauseFreeWrap = document.getElementById("pmCauseFreeWrap");
  const pmCauseFree = document.getElementById("pmCauseFree");

  const pmCh9Btn = document.getElementById("pmCh9Btn");
  const pmCh9Menu = document.getElementById("pmCh9Menu");
  const pmCh9Label = document.getElementById("pmCh9Label");

  const pmSavBtn = document.getElementById("pmSavBtn");
  const pmSavMenu = document.getElementById("pmSavMenu");
  const pmSavLabel = document.getElementById("pmSavLabel");

  let pmCartId = null;
  let pmPcIdx = null;

  // Plan order
  const leftOrderPlan = ["P9", "P8", "P7", "P6", "P5", "P4", "P3", "P2", "P1"];
  const rightOrderPlan = ["P10", "P11", "P12", "P13", "P14", "P15"];
  const allSockets = [...leftOrderPlan, ...rightOrderPlan];

  const leftDropdownOrder = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];
  const rightDropdownOrder = ["P10", "P11", "P12", "P13", "P14", "P15"];

  // --- utils ---
  const openModal = (el) => (el.dataset.open = "1");
  const closeModal = (el) => (el.dataset.open = "0");

  const getCartById = (id) => state.carts.find((c) => c.id === id) || null;
  const nextCartId = () => {
    const ids = state.carts.map((c) => c.id).filter((n) => Number.isFinite(n));
    return ids.length ? Math.max(...ids) + 1 : 1;
  };
  const socketOccupant = (p) => state.carts.find((c) => c.position === p) || null;

  const cartNumberFromName = (cart) => {
    const m = String(cart?.name ?? "").match(/\d+/g);
    return m && m.length ? m[m.length - 1] : String(cart?.id ?? "");
  };

  const sheetTypeFromCart = (cart) => (cart.lotType === "BTO" ? "BTO" : "LineUp");

  const lotDisplay = (cart) => {
    if (cart.lotType === "BTO") return "BTO";
    return cart.lotName ? `Line-up ${cart.lotName}` : "Line-up —";
  };

  // --- logs (PROBLEM only) ---
  const addLog = (entry) => {
    if (entry?.type !== "PROBLEM") return;
    apiAddLog(entry);
  };

  const fmtTSVLogs = () => {
    const day = localISODate();
    const logs = (state.logsByDay[day] || []).filter((l) => l.type === "PROBLEM");

    const header = [
      "Semaine",
      "Date",
      "Type",
      "Monteur",
      "Erreur Monteur",
      "SN",
      "Lot",
      "Chariot",
      "Place",
      "Observations",
      "Cause",
      "Chariot 9",
      "SAV",
      "Commentaires",
    ].join("\t");

    const lines = logs.map((l) => [
      l.week ?? "",
      l.date ?? "",
      l.sheetType ?? "",
      l.monteur ?? "",
      l.errMonteur ?? "",
      l.sn ?? "",
      l.lot ?? "",
      l.cartNo ?? "",
      l.place ?? "",
      l.observations ?? "",
      l.cause ?? "",
      l.chariot9 ?? "",
      l.sav ?? "",
      (l.commentaires ?? "").replace(/\t/g, " ").replace(/\n/g, " "),
    ].join("\t"));

    return [header, ...lines].join("\n");
  };

  const renderLogs = () => {
    const day = localISODate();
    const logs = (state.logsByDay[day] || []).filter((l) => l.type === "PROBLEM");
    logCount.textContent = String(logs.length);
    logsEl.innerHTML = "";

    if (logs.length === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Aucun problème reporté pour l’instant.";
      logsEl.appendChild(e);
      return;
    }

    for (const l of logs.slice(0, 200)) {
      const item = document.createElement("div");
      item.className = "log-item";

      const line1 = document.createElement("div");
      line1.className = "line1";

      const when = document.createElement("div");
      when.className = "when";
      when.textContent = `${l.date || ""} • S${l.week || ""}`;

      const tag = document.createElement("span");
      const isProblem = (l.sav === "Oui") || (l.chariot9 === "Oui");
      tag.className = "tag " + (isProblem ? "tag-prob" : "tag-obs");
      tag.textContent = isProblem ? "PROBLÈME" : "OBSERVATION";

      line1.appendChild(when);
      line1.appendChild(tag);

      const what = document.createElement("div");
      what.className = "what";
      const head = [
        l.sheetType || "",
        `Chariot ${l.cartNo || ""}`,
        `PC ${l.place || ""}`,
        l.sn ? `SN ${l.sn}` : "",
        l.monteur ? `Monteur ${l.monteur}` : "",
        l.observations ? `Obs: ${l.observations}` : "",
        l.cause ? `Cause: ${l.cause}` : "",
      ].filter(Boolean).join(" • ");

      what.textContent = head + (l.commentaires ? ` — ${l.commentaires}` : "");

      item.appendChild(line1);
      item.appendChild(what);
      logsEl.appendChild(item);
    }
  };

  const fmtSummary = () => {
    const placed = state.carts
      .filter((c) => c.position)
      .sort((a, b) => a.position.localeCompare(b.position, "fr", { numeric: true }))
      .map((c) => [
        c.position,
        c.name,
        c.lotType,
        c.lotType === "BTO" ? "" : (c.lotName || ""),
        String(c.deployMinutes ?? ""),
        String(c.burnMinutes ?? ""),
      ].join("\t"))
      .join("\n");

    return "Prise\tChariot\tType\tLot\tDéploiement(min)\tBurn(min)\n" + (placed || "");
  };

  // --- PC dots ---
  const pcDotClass = (pc) => {
    if (pc.problem) {
      const raw = String(pc.problemStatus || "").trim();
      const isObs = (raw === "OBS" || raw === "WARN" || raw === "MINOR");
      return isObs ? "obs" : "prob";
    }
    const hasInfo = (pc.sn && pc.sn.trim()) || (pc.monteur && pc.monteur.trim());
    return hasInfo ? "ok" : "empty";
  };

  const makePcDots = (cart) => {
    const wrap = document.createElement("div");
    wrap.className = "pc-dots";
    for (const pc of cart.pcs) {
      const d = document.createElement("span");
      d.className = "pc-dot " + pcDotClass(pc);
      wrap.appendChild(d);
    }
    return wrap;
  };

  // --- placement ---
  const placeCartOnSocket = (cartId, p) => {
    const cart = getCartById(cartId);
    if (!cart) return false;

    const existing = socketOccupant(p);
    if (existing && existing.id !== cart.id) {
      alert(`La prise ${p} est déjà occupée par ${existing.name}.`);
      return false;
    }

    apiSetCartPosition(cartId, p);
    return true;
  };

  const clearSocket = (p) => {
    const occ = socketOccupant(p);
    if (!occ) return;
    apiClearPosition(p);
  };

  // --- render: non placés ---
  const renderUnplacedList = () => {
    const unplaced = state.carts.filter((c) => !c.position).sort((a, b) => a.id - b.id);

    unplacedList.innerHTML = "";
    if (unplaced.length === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Aucun chariot non placé.";
      unplacedList.appendChild(e);
      return;
    }

    for (const c of unplaced) {
      const item = document.createElement("div");
      item.className = "unplaced-item";
      item.draggable = true;

      item.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ kind: "cart", id: c.id }));
        ev.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("click", () => openCartModal(c.id));

      const left = document.createElement("div");
      left.className = "unplaced-left";

      const name = document.createElement("div");
      name.className = "unplaced-name";
      name.textContent = c.name;

      const meta = document.createElement("div");
      meta.className = "unplaced-meta";
      meta.textContent = `${lotDisplay(c)} • Déploiement: ${c.deployMinutes} min • Burn: ${c.burnMinutes} min`;

      left.appendChild(name);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "mini-actions";

      const del = document.createElement("button");
      del.className = "btn danger btn-mini";
      del.textContent = "Supprimer";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Supprimer "${c.name}" ?`)) return;

        if (openCartId === c.id) closeCartModal();

        apiDeleteCart(c.id);
      });

      actions.appendChild(del);

      item.appendChild(left);
      item.appendChild(actions);
      unplacedList.appendChild(item);
    }
  };

  // --- render: plan ---
  const makeSocket = (p) => {
    const socket = document.createElement("div");
    socket.className = "socket";
    socket.dataset.socket = p;
    socket.dataset.over = "0";

    socket.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      socket.dataset.over = "1";
      ev.dataTransfer.dropEffect = "move";
    });
    socket.addEventListener("dragleave", () => (socket.dataset.over = "0"));
    socket.addEventListener("drop", (ev) => {
      ev.preventDefault();
      socket.dataset.over = "0";
      try {
        const payload = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}");
        if (payload.kind === "cart" && typeof payload.id === "number") {
          const ok = placeCartOnSocket(payload.id, p);
          if (ok) renderAll();
        }
      } catch { }
    });

    const pname = document.createElement("div");
    pname.className = "pname";
    pname.textContent = p;

    const slot = document.createElement("div");
    slot.className = "slot";

    socket.appendChild(pname);
    socket.appendChild(slot);
    return socket;
  };

  const renderPlan = () => {
    leftSockets.innerHTML = "";
    rightSockets.innerHTML = "";

    for (const p of leftOrderPlan) leftSockets.appendChild(makeSocket(p));
    for (const p of rightOrderPlan) rightSockets.appendChild(makeSocket(p));

    for (const p of allSockets) {
      const occ = socketOccupant(p);
      const socketEl = document.querySelector(`.socket[data-socket="${p}"]`);
      const slot = socketEl.querySelector(".slot");
      slot.innerHTML = "";

      if (!occ) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Aucun chariot";

        const actions = document.createElement("div");
        actions.className = "mini-actions";

        const btnAssign = document.createElement("button");
        btnAssign.className = "btn primary";
        btnAssign.textContent = "Assigner";
        btnAssign.addEventListener("click", () => openAssignModal(p));

        actions.appendChild(btnAssign);
        slot.appendChild(empty);
        slot.appendChild(actions);
      } else {
        const occEl = document.createElement("div");
        occEl.className = "occupant";
        occEl.draggable = true;
        occEl.title = "Cliquer pour ouvrir — ou glisser pour déplacer";

        occEl.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", JSON.stringify({ kind: "cart", id: occ.id }));
          ev.dataTransfer.effectAllowed = "move";
        });
        occEl.addEventListener("click", () => openCartModal(occ.id));

        const cname = document.createElement("div");
        cname.className = "cname";
        cname.textContent = occ.name;

        const cline = document.createElement("div");
        cline.className = "cline";
        cline.textContent = `${lotDisplay(occ)}`;

        occEl.appendChild(cname);
        occEl.appendChild(cline);
        occEl.appendChild(makePcDots(occ));

        const actions = document.createElement("div");
        actions.className = "mini-actions";

        const btnClear = document.createElement("button");
        btnClear.className = "btn";
        btnClear.textContent = "Vider";
        btnClear.addEventListener("click", () => clearSocket(p));

        actions.appendChild(btnClear);

        slot.appendChild(occEl);
        slot.appendChild(actions);
      }
    }
  };

  // --- assign modal ---
  const openAssignModal = (socket) => {
    assignTargetSocket = socket;
    asSub.textContent = `Prise : ${socket}`;

    const options = state.carts.filter((c) => !c.position).sort((a, b) => a.id - b.id);
    asSelect.innerHTML = "";

    if (options.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Aucun chariot non placé";
      asSelect.appendChild(o);
      asSelect.disabled = true;
      asSave.disabled = true;
    } else {
      asSelect.disabled = false;
      asSave.disabled = false;
      for (const c of options) {
        const o = document.createElement("option");
        o.value = String(c.id);
        o.textContent = `${c.name} — ${lotDisplay(c)}`;
        asSelect.appendChild(o);
      }
    }

    openModal(assignModal);
  };

  const closeAssignModal = () => {
    closeModal(assignModal);
    assignTargetSocket = null;
  };

  asCancel.addEventListener("click", closeAssignModal);
  assignModal.addEventListener("click", (e) => { if (e.target === assignModal) closeAssignModal(); });

  asSave.addEventListener("click", () => {
    const id = Number(asSelect.value);
    if (!Number.isFinite(id) || !assignTargetSocket) return;
    const ok = placeCartOnSocket(id, assignTargetSocket);
    if (ok) {
      closeAssignModal();
      renderAll();
    }
  });

  // --- toggle left card ---
  if (btnToggleLeft) {
    btnToggleLeft.addEventListener("click", () => {
      const cardLeft = document.querySelector(".card.left");
      if (cardLeft) {
        cardLeft.classList.toggle("collapsed");
      }
    });
  }

  // --- cart modal (12 PC) ---
  const openCartModal = (cartId) => {
    const cart = getCartById(cartId);
    if (!cart) return;

    openCartId = cartId;
    cartTitle.textContent = cart.name;

    const pos = cart.position ? `Sur ${cart.position}` : "Non placé";
    cartSub.textContent = `${pos} • ${lotDisplay(cart)} • Déploiement: ${cart.deployMinutes} min • Burn: ${cart.burnMinutes} min`;

    pcGrid.innerHTML = "";

    for (const pc of cart.pcs) {
      const pcEl = document.createElement("div");
      pcEl.className = "pc";
      pcEl.dataset.problem = pc.problem ? "1" : "0";

      const topline = document.createElement("div");
      topline.className = "topline";

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = `PC ${pc.idx}`;

      const flag = document.createElement("span");
      flag.className = "problem-flag";
      flag.textContent = "PROBLÈME";

      topline.appendChild(num);
      topline.appendChild(flag);

      const snLabel = document.createElement("label");
      snLabel.textContent = "SN";
      const snInput = document.createElement("input");
      snInput.className = "mini";
      snInput.placeholder = "Ex: 162356-28";
      snInput.value = pc.sn;
      snInput.addEventListener("change", () => {
        apiUpdatePc(pc.id, { sn: snInput.value });
      });
      snLabel.appendChild(snInput);

      const monLabel = document.createElement("label");
      monLabel.textContent = "Monteur (prénom)";
      const monInput = document.createElement("input");
      monInput.className = "mini";
      monInput.placeholder = "Ex: Zani";
      monInput.value = pc.monteur;
      monInput.addEventListener("change", () => {
        apiUpdatePc(pc.id, { monteur: monInput.value });
      });
      monLabel.appendChild(monInput);

      const actions = document.createElement("div");
      actions.className = "pc-actions";

      const btnProb = document.createElement("button");
      btnProb.className = "btn danger";

      // Statut actuel (compat: problemStatus ou problemTag)
      const getStatus = () => String(pc.problemStatus || pc.problemTag || "").trim();

      // Rouge = vrai problème (PROB / SAV / CH9)
      const isRedProblem = () => pc.problem && ["PROB", "SAV", "CH9"].includes(getStatus());

      // Le badge "PROBLÈME" du modal (dataset) ne doit s’afficher que si rouge
      pcEl.dataset.problem = isRedProblem() ? "1" : "0";

      // Texte bouton : enlever uniquement si rouge
      btnProb.textContent = isRedProblem() ? "Enlever problème" : "Problème";

      btnProb.addEventListener("click", () => {
        if (isRedProblem()) {
          // On enlève uniquement les rouges
          apiUpdatePc(pc.id, {
            problem: false,
            problemStatus: "",
            problemTag: ""
          });

          pcEl.dataset.problem = "0";
          btnProb.textContent = "Problème";
          // Refetch will allow full sync, but we update UI immediately or await
          // For V2 simplest: just let fetchState refresh UI
          return;
        }

        // Si jaune (OBS) => on NE propose PAS “Enlever problème”, on ouvre le report
        openProblemModalFor(cart.id, pc.idx);
      });

      actions.appendChild(btnProb);

      pcEl.appendChild(topline);
      pcEl.appendChild(snLabel);
      pcEl.appendChild(monLabel);
      pcEl.appendChild(actions);

      pcGrid.appendChild(pcEl);
    }

    openModal(cartModal);
  };

  const closeCartModal = () => {
    closeModal(cartModal);
    openCartId = null;
  };

  btnCartClose.addEventListener("click", closeCartModal);
  cartModal.addEventListener("click", (e) => { if (e.target === cartModal) closeCartModal(); });

  // --- fake select helper (simple) ---
  const fakeSelects = [];

  const makeFakeSelect = ({ wrapId, btn, label, menu, optionsFn, onChange }) => {
    const wrap = document.getElementById(wrapId);
    let value = "";

    const close = () => { menu.dataset.open = "0"; };

    const set = (v) => {
      value = v ?? "";
      const opts = optionsFn();
      const found = opts.find(o => o.type !== "group" && o.type !== "sep" && o.value === value);
      label.textContent = found ? found.label : "—";
      close();
      if (onChange) onChange(value);
    };

    const toggle = () => { menu.dataset.open = (menu.dataset.open === "1") ? "0" : "1"; };

    const rebuild = () => {
      menu.innerHTML = "";
      for (const o of optionsFn()) {
        if (o.type === "sep") {
          const sep = document.createElement("div");
          sep.className = "fs-sep";
          menu.appendChild(sep);
          continue;
        }
        if (o.type === "group") {
          const g = document.createElement("div");
          g.className = "fs-group";
          g.textContent = o.label;
          menu.appendChild(g);
          continue;
        }

        const b = document.createElement("button");
        b.type = "button";
        b.className = "fs-item";

        const left = document.createElement("span");
        left.textContent = o.label;

        b.appendChild(left);

        if (o.sub) {
          const right = document.createElement("span");
          right.className = "sub";
          right.textContent = o.sub;
          b.appendChild(right);
        }

        if (o.disabled) {
          b.setAttribute("disabled", "disabled");
        } else {
          b.addEventListener("click", () => set(o.value));
        }

        menu.appendChild(b);
      }

      // refresh label
      const opts = optionsFn();
      const found = opts.find(o => o.type !== "group" && o.type !== "sep" && o.value === value);
      label.textContent = found ? found.label : "—";
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      rebuild();   // ✅ construit (ou reconstruit) les items
      toggle();    // ouvre/ferme
    });

    fakeSelects.push({ wrap, close });

    rebuild(); // ✅ construit une première fois au chargement

    return { get: () => value, set, rebuild, close };
  };

  document.addEventListener("click", (e) => {
    for (const fs of fakeSelects) {
      if (!fs.wrap) continue;
      if (!fs.wrap.contains(e.target)) fs.close();
    }
  });

  // --- Add cart rules ---
  const applyCartTypeRules = () => {
    const t = acTypeValue;
    acDeploy.value = String(DEFAULT_DEPLOY_MIN);

    if (t === "BTO") {
      acLot.value = "";
      acLotWrap.style.display = "none";
      acBurn.value = String(DEFAULT_BURN_BTO);
    } else {
      acLotWrap.style.display = "block";
      acBurn.value = String(DEFAULT_BURN_LINEUP);
    }
  };

  // Add cart Type fake select
  const acTypeFS = makeFakeSelect({
    wrapId: "acTypeSelect",
    btn: acTypeBtn,
    label: acTypeLabel,
    menu: acTypeMenu,
    optionsFn: () => ([
      { value: "LINEUP", label: "Line-up", sub: "Lot obligatoire • Burn 30" },
      { value: "BTO", label: "BTO", sub: "Pas de lot • Burn 60" },
    ]),
    onChange: (v) => {
      acTypeValue = (v === "BTO") ? "BTO" : "LINEUP";
      applyCartTypeRules();
    }
  });

  // Add cart Socket dropdown (grouped)
  const setAcSocket = (value, labelText) => {
    acSocketValue = value || "";
    acSocketLabel.textContent = labelText || "— Ne pas placer maintenant —";
    acSocketMenu.dataset.open = "0";
  };
  const toggleAcSocketMenu = () => {
    acSocketMenu.dataset.open = (acSocketMenu.dataset.open === "1") ? "0" : "1";
  };
  const closeAcSocketMenu = () => { acSocketMenu.dataset.open = "0"; };

  // --- dropdown positioning (avoid clipping + keep scroll inside the menu) ---
  const positionAcSocketMenu = () => {
    if (acSocketMenu.dataset.open !== "1") return;

    acSocketMenu.classList.remove("open-up");
    acSocketMenu.style.maxHeight = "320px";

    const br = acSocketBtn.getBoundingClientRect();
    const margin = 18;
    const minNeeded = 220;

    const spaceBelow = window.innerHeight - br.bottom - margin;
    const spaceAbove = br.top - margin;

    const openUp = (spaceBelow < minNeeded) && (spaceAbove > spaceBelow);
    const avail = (openUp ? spaceAbove : spaceBelow) - 8;

    const maxH = Math.max(160, Math.min(320, Math.floor(avail)));
    acSocketMenu.style.maxHeight = `${maxH}px`;

    if (openUp) acSocketMenu.classList.add("open-up");
  };

  window.addEventListener("resize", positionAcSocketMenu);

  // register outside close for socket select
  fakeSelects.push({ wrap: document.getElementById("acSocketSelect"), close: closeAcSocketMenu });

  acSocketBtn.addEventListener("click", (e) => {
    e.preventDefault();
    refreshSocketOptions();

    if (acSocketMenu.dataset.open === "1") {
      closeAcSocketMenu();
      return;
    }

    acSocketMenu.dataset.open = "1";
    acSocketMenu.scrollTop = 0;
    positionAcSocketMenu();
  });

  const refreshSocketOptions = () => {
    acSocketMenu.innerHTML = "";

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "fs-item";
    noneBtn.textContent = "— Ne pas placer maintenant —";
    noneBtn.addEventListener("click", () => setAcSocket("", "— Ne pas placer maintenant —"));
    acSocketMenu.appendChild(noneBtn);

    const sep = document.createElement("div");
    sep.className = "fs-sep";
    acSocketMenu.appendChild(sep);

    const addGroup = (title, arr) => {
      const g = document.createElement("div");
      g.className = "fs-group";
      g.textContent = title;
      acSocketMenu.appendChild(g);

      for (const p of arr) {
        const occ = socketOccupant(p);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fs-item";

        const left = document.createElement("span");
        left.textContent = p;

        const right = document.createElement("span");
        right.className = "sub";

        if (occ) {
          right.textContent = `Occupée (${occ.name})`;
          btn.setAttribute("disabled", "disabled");
        } else {
          right.textContent = "Libre";
          btn.addEventListener("click", () => setAcSocket(p, `${p} — Libre`));
        }

        btn.appendChild(left);
        btn.appendChild(right);
        acSocketMenu.appendChild(btn);
      }
    };

    addGroup("Côté gauche (P1 → P9)", leftDropdownOrder);

    const sep2 = document.createElement("div");
    sep2.className = "fs-sep";
    acSocketMenu.appendChild(sep2);

    addGroup("Côté droit (P10 → P15)", rightDropdownOrder);

    if (!acSocketValue) setAcSocket("", "— Ne pas placer maintenant —");
    else if (socketOccupant(acSocketValue)) setAcSocket("", "— Ne pas placer maintenant —");
  };

  // Bulk parse from Sheets: 1 line SN, next line prénom. Empty lines count.
  const parseBulkSnMonteur = (text) => {
    const raw = String(text || "").replace(/\r/g, "");
    const lines = raw.split("\n");
    const seq = lines.map((line) => (line.split("\t")[0] ?? "").trim());
    const out = Array.from({ length: 12 }, () => ({ sn: "", monteur: "" }));
    for (let i = 0; i < 12; i++) {
      out[i].sn = seq[i * 2] ?? "";
      out[i].monteur = seq[i * 2 + 1] ?? "";
    }
    return out;
  };

  const parseMinutes = (val) => {
    const s = String(val ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return n;
  };

  // BIOS alert UI (inject in add-cart modal)
  const acBiosAlert = document.createElement("div");
  acBiosAlert.id = "acBiosAlert";
  acBiosAlert.className = "bios-alert";
  acBiosAlert.style.display = "none";
  acLotWrap.appendChild(acBiosAlert);

  const refreshAddCartBiosAlert = () => {
    const lotType = acTypeValue;
    const lot = (acLot.value || "").trim();
    if (lotType !== "LINEUP" || !lot) {
      acBiosAlert.style.display = "none";
      acBiosAlert.textContent = "";
      return;
    }

    const note = biosNoteForLot(lot);
    if (!note) {
      acBiosAlert.style.display = "none";
      acBiosAlert.textContent = "";
      return;
    }

    acBiosAlert.style.display = "block";
    acBiosAlert.innerHTML = `
    <div class="bios-title">⚠️ BIOS à modifier pour ce lot</div>
    <div class="bios-body"><span class="bios-lot">${lot}</span> — ${note}</div>
  `;
  };

  // live update
  acLot.addEventListener("input", refreshAddCartBiosAlert);

  const openAddCartModal = () => {
    const id = nextCartId();
    acName.value = `Chariot ${id}`;
    acLot.value = "";
    acBulk.value = "";

    acTypeFS.set("LINEUP"); // triggers rules
    acTypeValue = "LINEUP";
    applyCartTypeRules();

    setAcSocket("", "— Ne pas placer maintenant —");
    refreshSocketOptions();

    openModal(addCartModal);
    setTimeout(() => acLot.focus(), 0);

    refreshAddCartBiosAlert();

  };

  const closeAddCartModal = () => {
    closeModal(addCartModal);
    closeAcSocketMenu();
    acTypeFS.close();
  };

  btnAddCart.addEventListener("click", openAddCartModal);
  acCancel.addEventListener("click", closeAddCartModal);
  addCartModal.addEventListener("click", (e) => { if (e.target === addCartModal) closeAddCartModal(); });

  acSave.addEventListener("click", () => {
    const id = nextCartId();
    const name = (acName.value || "").trim() || `Chariot ${id}`;

    const lotType = acTypeValue;
    let lotName = "";
    if (lotType === "LINEUP") {
      lotName = (acLot.value || "").trim();
      if (!lotName) {
        alert("En Line-up, le nom du lot est obligatoire.");
        return;
      }
    } else {
      lotName = "";
    }

    // BIOS reminder confirmation (LineUp only)
    if (lotType === "LINEUP") {
      const note = biosNoteForLot(lotName);
      if (note) {
        const ok = confirm(`⚠️ BIOS à modifier pour le lot ${lotName}:\n\n${note}\n\nConfirmer que c'est pris en compte ?`);
        if (!ok) return;
      }
    }

    const deployMinutes = parseMinutes(acDeploy.value);
    const burnMinutes = parseMinutes(acBurn.value);
    if (Number.isNaN(deployMinutes)) return alert("Temps de déploiement invalide.");
    if (Number.isNaN(burnMinutes)) return alert("Temps de burn invalide.");

    const finalDeploy = deployMinutes ?? DEFAULT_DEPLOY_MIN;
    const finalBurn = burnMinutes ?? (lotType === "BTO" ? DEFAULT_BURN_BTO : DEFAULT_BURN_LINEUP);

    const target = (acSocketValue || "").trim();
    if (target && socketOccupant(target)) {
      alert(`La prise ${target} est déjà occupée.`);
      return;
    }

    const bulk = parseBulkSnMonteur(acBulk.value);

    const cart = {
      id,
      name,
      position: target || null,
      lotType,
      lotName,
      deployMinutes: finalDeploy,
      burnMinutes: finalBurn,
      pcs: Array.from({ length: 12 }, (_, p) => ({
        idx: p + 1,
        sn: bulk[p]?.sn || "",
        monteur: bulk[p]?.monteur || "",
        problem: false,
        problemStatus: "",
      })),
    };

    apiCreateCart(cart);
    closeAddCartModal();
  });

  // --- problem modal fake-selects ---
  const pmTypeFS = makeFakeSelect({
    wrapId: "pmTypeSelect",
    btn: pmTypeBtn,
    label: pmTypeLabel,
    menu: pmTypeMenu,
    optionsFn: () => ([
      { value: "LineUp", label: "LineUp" },
      { value: "BTO", label: "BTO" },
    ]),
    onChange: (v) => {
      if (v === "BTO") {
        pmLot.value = "";
        pmLot.disabled = true;
      } else {
        pmLot.disabled = false;
      }
    }
  });

  const pmErrFS = makeFakeSelect({
    wrapId: "pmErrSelect",
    btn: pmErrBtn,
    label: pmErrLabel,
    menu: pmErrMenu,
    optionsFn: () => ([
      { value: "Oui", label: "Oui" },
      { value: "Non", label: "Non" },
      { value: "Inc", label: "Inc" },
    ]),
  });

  const pmObsFS = makeFakeSelect({
    wrapId: "pmObsSelect",
    btn: pmObsBtn,
    label: pmObsLabel,
    menu: pmObsMenu,
    optionsFn: () => ([
      { value: "", label: "—" },
      ...OBS_OPTIONS.map(v => ({ value: v, label: v })),
      { type: "sep" },
      { value: "__FREE__", label: "Autre…" },
    ]),
    onChange: (v) => {
      if (v === "__FREE__") {
        pmObsFreeWrap.style.display = "block";
        setTimeout(() => pmObsFree.focus(), 0);
      } else {
        pmObsFreeWrap.style.display = "none";
        pmObsFree.value = "";
      }
    }
  });

  const pmCauseFS = makeFakeSelect({
    wrapId: "pmCauseSelect",
    btn: pmCauseBtn,
    label: pmCauseLabel,
    menu: pmCauseMenu,
    optionsFn: () => ([
      { value: "", label: "—" },
      ...CAUSE_OPTIONS.map(v => ({ value: v, label: v })),
      { type: "sep" },
      { value: "__FREE__", label: "Autre…" },
    ]),
    onChange: (v) => {
      if (v === "__FREE__") {
        pmCauseFreeWrap.style.display = "block";
        setTimeout(() => pmCauseFree.focus(), 0);
      } else {
        pmCauseFreeWrap.style.display = "none";
        pmCauseFree.value = "";
      }
    }
  });

  const pmCh9FS = makeFakeSelect({
    wrapId: "pmCh9Select",
    btn: pmCh9Btn,
    label: pmCh9Label,
    menu: pmCh9Menu,
    optionsFn: () => ([
      { value: "Oui", label: "Oui" },
      { value: "Non", label: "Non" },
    ]),
  });

  const pmSavFS = makeFakeSelect({
    wrapId: "pmSavSelect",
    btn: pmSavBtn,
    label: pmSavLabel,
    menu: pmSavMenu,
    optionsFn: () => ([
      { value: "Oui", label: "Oui" },
      { value: "Non", label: "Non" },
    ]),
  });

  pmDate.addEventListener("change", () => {
    pmWeek.value = weekFromISODate(pmDate.value);
  });

  const openProblemModalFor = (cartId, pcIdx) => {
    const cart = getCartById(cartId);
    if (!cart) return;

    const pc = cart.pcs.find(x => x.idx === pcIdx);
    if (!pc) return;

    pmCartId = cartId;
    pmPcIdx = pcIdx;

    pmSub.textContent = `${cart.position ? cart.position : "Non placé"} • ${cart.name} • PC ${pcIdx}`;

    const dateIso = localISODate();
    pmDate.value = dateIso;
    pmWeek.value = weekFromISODate(dateIso);

    pmTypeFS.set(sheetTypeFromCart(cart));
    pmErrFS.set("Inc");

    pmMonteur.value = pc.monteur || "";
    pmSn.value = pc.sn || "";

    pmLot.disabled = (sheetTypeFromCart(cart) === "BTO");
    pmLot.value = (cart.lotType === "BTO") ? "" : (cart.lotName || "");

    pmCartNo.value = cartNumberFromName(cart);
    pmPlace.value = String(pcIdx);

    pmObsFS.set("");
    pmCauseFS.set("");
    pmCh9FS.set("Non");
    pmSavFS.set("Non");

    pmComment.value = "";

    openModal(problemModal);
    setTimeout(() => pmMonteur.focus(), 0);
  };

  const closeProblemModal = () => {
    closeModal(problemModal);
    pmCartId = null;
    pmPcIdx = null;
  };

  pmCancel.addEventListener("click", closeProblemModal);
  problemModal.addEventListener("click", (e) => { if (e.target === problemModal) closeProblemModal(); });

  pmSave.addEventListener("click", () => {
    const cart = getCartById(pmCartId);
    if (!cart) return;

    const pc = cart.pcs.find(x => x.idx === pmPcIdx);
    if (!pc) return;

    const week = (pmWeek.value || "").trim();
    const date = (pmDate.value || "").trim();
    const sheetType = pmTypeFS.get() || "";
    const errMonteur = pmErrFS.get() || "";

    const monteur = (pmMonteur.value || "").trim();
    const sn = (pmSn.value || "").trim();

    const lot = (sheetType === "BTO") ? "" : (pmLot.value || "").trim();
    const cartNo = (pmCartNo.value || "").trim();
    const place = (pmPlace.value || "").trim();

    const obsSel = pmObsFS.get();
    const observations = (obsSel === "__FREE__") ? (pmObsFree.value || "").trim() : (obsSel || "");

    const causeSel = pmCauseFS.get();
    const cause = (causeSel === "__FREE__") ? (pmCauseFree.value || "").trim() : (causeSel || "");

    const chariot9 = pmCh9FS.get() || "";
    const sav = pmSavFS.get() || "";

    // Rouge = PROB (SAV Oui OU Chariot 9 Oui)
    // Jaune = OBS  (SAV Non ET Chariot 9 Non)
    const problemStatus = (sav === "Oui" || chariot9 === "Oui") ? "PROB" : "OBS";

    const commentaires = (pmComment.value || "").trim();

    // Sync “gagne du temps” : on met à jour les infos PC/cart si modifiées
    pc.monteur = monteur;
    pc.sn = sn;

    if (sheetType === "BTO") {
      cart.lotType = "BTO";
      cart.lotName = "";
    } else {
      cart.lotType = "LINEUP";
      cart.lotName = lot; // garde le lot du report si tu l’as corrigé
    }

    pc.problem = true;
    pc.problemStatus = problemStatus;

    // 4. Update Cart (lot if needed)
    if (supabase) {
      const payload = { lot_type: cart.lotType };
      if (cart.lotType === "LINEUP") payload.lot_name = cart.lotName;
      supabase.from("carts").update(payload).eq("id", cart.id).then(() => { });
    }

    // 5. Update PC
    apiUpdatePc(pc.id, {
      monteur,
      sn,
      problem: true,
      problemStatus
    });

    addLog({
      type: "PROBLEM",
      week,
      date,
      sheetType,
      monteur,
      errMonteur,
      sn,
      lot,
      cartNo,
      place,
      observations,
      cause,
      chariot9,
      sav,
      commentaires,

      // contexte interne
      socket: cart.position || "",
      cartName: cart.name,
      pcIdx: pc.idx,
    });

    closeProblemModal();
    if (openCartId) openCartModal(openCartId);
  });

  // --- buttons (copy logs / clear logs / reset / summary) ---
  btnCopyLogs.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(fmtTSVLogs());
      alert("Logs copiés (TSV). Colle directement dans Sheets.");
    } catch {
      alert("Copie impossible (permissions navigateur).");
    }
  });

  btnClearLogs.addEventListener("click", () => {
    if (!confirm("Vider les logs (problèmes) d’aujourd’hui ?")) return;
    apiClearLogsToday();
  });

  btnResetPos.addEventListener("click", () => {
    if (!confirm("Retirer tous les chariots des prises ?")) return;
    apiResetAllPositions();
  });

  // --- center clock (Europe/Paris) ---
  const startCenterClock = () => {
    if (!centerDateTime) return;

    const fmt = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    const tick = () => {
      const parts = fmt.formatToParts(new Date());
      const get = (type) => parts.find((p) => p.type === type)?.value ?? "";

      const weekday = capFirst(get("weekday"));
      const day = get("day");       // "4"
      const month = capFirst(get("month"));
      const year = get("year");

      const hour = get("hour");
      const minute = get("minute");
      const second = get("second");

      centerDateTime.textContent = `${weekday} ${day} ${month} ${year} - ${hour}:${minute}:${second}`;
    };

    tick();
    setInterval(tick, 1000);
  };

  startCenterClock();

  // --- render all ---
  const renderAll = () => {
    renderUnplacedList();
    renderPlan();
    renderLogs();
  };

  // expose openProblemModalFor to cart modal scope
  window.__openProblemModalFor = openProblemModalFor;

  // IMPORTANT: our cart modal uses openProblemModalFor directly
  // (we keep the function in scope already)

  // Init app
  fetchState();
})();
