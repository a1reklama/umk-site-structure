const tree = window.UMK_FULL_TREE || [];
const root = tree[0] || null;
const VIEW_NAMES = ["structure", "menu", "mindmap"];

const visibleChildren = (node) => (node?.children || []).filter((child) => child.nodeType !== "tag");
const flat = (nodes = tree) => nodes.flatMap((node) => [node, ...flat(node.children || [])]);
const allNodes = flat().filter((node) => node.nodeType !== "tag");
const nodeById = new Map(allNodes.map((node) => [node.id, node]));
const parentById = new Map();
const depthById = new Map();

function indexTree(nodes, parent = null, depth = 1) {
  for (const node of nodes) {
    if (parent) parentById.set(node.id, parent);
    depthById.set(node.id, depth);
    indexTree(node.children || [], node, depth + 1);
  }
}

indexTree(tree);

const firstTopNode = visibleChildren(root)[0] || root;

const state = {
  view: "structure",
  treeCollapsed: new Set(),
  selectedId: firstTopNode?.id || root?.id || "",
  lastTrigger: null,
  detailsOpen: false,
  menuOpen: true,
  activeTopId: firstTopNode?.id || "",
  activeMiddleId: "",
  menuPath: root ? [root.id] : [],
  mapExpanded: new Set(),
  mapTransform: { x: 0, y: 0, scale: 1 },
  mapBounds: null,
  mapHasFit: false,
  mapRenderToken: 0,
  mapPan: null,
};

function resetMapExpansion() {
  state.mapExpanded.clear();
  if (root) state.mapExpanded.add(root.id);
  if (firstTopNode && firstTopNode !== root) state.mapExpanded.add(firstTopNode.id);
}

resetMapExpansion();

const els = {
  body: document.body,
  shell: document.querySelector(".app-shell"),
  tabs: Array.from(document.querySelectorAll("[data-view-tab]")),
  panels: Array.from(document.querySelectorAll("[data-view-panel]")),
  tree: document.querySelector("#tree"),
  details: document.querySelector(".details"),
  detailTitle: document.querySelector("#detailTitle"),
  detailBadges: document.querySelector("#detailBadges"),
  detailPathSection: document.querySelector("#detailPathSection"),
  detailPath: document.querySelector("#detailPath"),
  detailUrl: document.querySelector("#detailUrl"),
  detailSeoSection: document.querySelector("#detailSeoSection"),
  detailSeo: document.querySelector("#detailSeo"),
  detailTagsSection: document.querySelector("#detailTagsSection"),
  detailTags: document.querySelector("#detailTags"),
  detailClose: document.querySelector("#detailClose"),
  detailsBackdrop: document.querySelector("#detailsBackdrop"),
  catalogRoot: document.querySelector("#catalogRoot"),
  catalogToggle: document.querySelector("#catalogToggle"),
  megaMenu: document.querySelector("#megaMenu"),
  mapViewport: document.querySelector("#mapViewport"),
  mapStage: document.querySelector("#mapStage"),
  mapLines: document.querySelector("#mapLines"),
  mapNodes: document.querySelector("#mapNodes"),
  mapStatus: document.querySelector("#mapStatus"),
  mapZoomOut: document.querySelector("#mapZoomOut"),
  mapZoomIn: document.querySelector("#mapZoomIn"),
  mapFit: document.querySelector("#mapFit"),
  mapReset: document.querySelector("#mapReset"),
};

const mobileDetails = window.matchMedia("(max-width: 900px)");
const mobileMenu = window.matchMedia("(max-width: 900px)");

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function publicStatus(node) {
  if (node.status === "На согласование" || node.status === "Добавить как теги") return node.status;
  return "";
}

function nodeSub(node) {
  if (node.nodeType === "menu-group") return "";
  return node.url || "";
}

function setBlockVisible(block, visible) {
  if (block) block.hidden = !visible;
}

function charCount(value) {
  return Array.from(String(value || "")).length;
}

function renderBadges(node) {
  const badges = [];
  const status = publicStatus(node);
  if (status) badges.push(status);
  if (node.seo?.createsPage === false) badges.push("без SEO-страницы");
  if ((node.tags || []).length) badges.push("теги");
  els.detailBadges.innerHTML = badges
    .map((badge) => '<span class="badge">' + esc(badge) + "</span>")
    .join("");
}

function renderPath(node) {
  const chain = [];
  let current = node;

  while (current) {
    if (current.nodeType !== "menu-group" && (current.url || current.nodeType === "root")) {
      chain.unshift(current);
    }
    current = parentById.get(current.id);
  }

  const parts = chain.map((item) => item.title).filter(Boolean);
  setBlockVisible(els.detailPathSection, parts.length > 1);
  els.detailPath.innerHTML = parts
    .map((part, index) => {
      const currentAttr = index === parts.length - 1 ? ' aria-current="page"' : "";
      return "<li" + currentAttr + "><span>" + esc(part) + "</span></li>";
    })
    .join("");
}

function renderSeo(node) {
  const seo = node.seo || {};
  if (!seo.createsPage || (!seo.title && !seo.description)) {
    setBlockVisible(els.detailSeoSection, false);
    els.detailSeo.className = "seo-card empty";
    els.detailSeo.textContent = "";
    return;
  }

  setBlockVisible(els.detailSeoSection, true);
  els.detailSeo.className = "seo-card";
  const title = seo.title || "";
  const description = seo.description || "";
  els.detailSeo.innerHTML = [
    '<article class="seo-field">',
    '<div class="seo-field-head"><span>Title</span><small>' + charCount(title) + " симв.</small></div>",
    "<p>" + esc(title) + "</p>",
    "</article>",
    '<article class="seo-field">',
    '<div class="seo-field-head"><span>Description</span><small>' + charCount(description) + " симв.</small></div>",
    "<p>" + esc(description) + "</p>",
    "</article>",
  ].join("");
}

function renderTags(node) {
  const tags = node.tags || [];
  if (!tags.length) {
    setBlockVisible(els.detailTagsSection, false);
    els.detailTags.className = "tag-list empty";
    els.detailTags.textContent = "";
    return;
  }

  setBlockVisible(els.detailTagsSection, true);
  els.detailTags.className = "tag-list";
  els.detailTags.innerHTML = tags
    .map((tag) => {
      const label = tag.status === "Связанный раздел" ? "связанный блок" : "без URL";
      return (
        '<span class="tag-chip" title="' +
        esc(tag.decision || "") +
        '">' +
        esc(tag.title) +
        "<small>" +
        esc(label) +
        "</small></span>"
      );
    })
    .join("");
}

function showDetails(node) {
  if (!node) return;
  els.detailTitle.textContent = node.title || "Выберите раздел";
  renderBadges(node);
  renderPath(node);
  els.detailUrl.textContent = node.url || (node.seo?.createsPage === false ? "SEO-страница не создается" : "без URL");
  renderSeo(node);
  renderTags(node);
}

function detailsUseOverlay() {
  return state.view !== "structure" || mobileDetails.matches;
}

function applyDetailsState(focusClose = false) {
  const overlay = detailsUseOverlay();

  if (!overlay) {
    state.detailsOpen = false;
    els.body.classList.remove("details-open");
    els.detailsBackdrop.classList.remove("is-visible");
    els.detailsBackdrop.setAttribute("aria-hidden", "true");
    els.details.removeAttribute("aria-hidden");
    els.details.removeAttribute("role");
    els.details.removeAttribute("aria-modal");
    return;
  }

  els.body.classList.toggle("details-open", state.detailsOpen);
  els.detailsBackdrop.classList.toggle("is-visible", state.detailsOpen);
  els.detailsBackdrop.setAttribute("aria-hidden", String(!state.detailsOpen));
  els.details.setAttribute("aria-hidden", String(!state.detailsOpen));

  if (state.detailsOpen) {
    els.details.setAttribute("role", "dialog");
    els.details.setAttribute("aria-modal", "true");
    if (focusClose) requestAnimationFrame(() => els.detailClose.focus({ preventScroll: true }));
  } else {
    els.details.removeAttribute("role");
    els.details.removeAttribute("aria-modal");
  }
}

function syncSelectionStyles() {
  document.querySelectorAll("[data-node-id]").forEach((element) => {
    const selected = element.dataset.nodeId === state.selectedId;
    element.classList.toggle("is-selected", selected);
    if (selected) element.setAttribute("aria-current", "true");
    else element.removeAttribute("aria-current");
  });
}

function openDetailsForNode(node, trigger) {
  if (!node) return;
  state.selectedId = node.id;
  state.lastTrigger = trigger || document.activeElement;
  showDetails(node);
  syncSelectionStyles();

  if (detailsUseOverlay()) {
    state.detailsOpen = true;
    applyDetailsState(true);
  } else {
    applyDetailsState(false);
  }
}

function closeDetails(returnFocus = true) {
  if (!detailsUseOverlay()) return;
  state.detailsOpen = false;
  applyDetailsState(false);

  if (returnFocus && state.lastTrigger && document.contains(state.lastTrigger)) {
    requestAnimationFrame(() => state.lastTrigger.focus({ preventScroll: true }));
  }
}

/* Hierarchical structure */

function toggleTreeNode(node) {
  if (!visibleChildren(node).length) return;
  if (state.treeCollapsed.has(node.id)) state.treeCollapsed.delete(node.id);
  else state.treeCollapsed.add(node.id);
  renderTree(node.id);
}

function renderTreeNodes(nodes, depth = 1) {
  const fragment = document.createDocumentFragment();

  for (const node of nodes.filter((item) => item.nodeType !== "tag")) {
    const branch = document.createElement("div");
    branch.className = "branch";

    const childrenNodes = visibleChildren(node);
    const hasChildren = childrenNodes.length > 0;
    const expanded = hasChildren && !state.treeCollapsed.has(node.id);
    const row = document.createElement("div");
    row.className = "node-row";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "node-toggle" + (hasChildren ? "" : " node-toggle-empty");
    toggle.disabled = !hasChildren;
    toggle.dataset.treeToggleId = node.id;
    toggle.setAttribute("aria-expanded", hasChildren ? String(expanded) : "false");
    toggle.setAttribute("aria-label", expanded ? "Свернуть раздел" : "Раскрыть раздел");
    toggle.innerHTML = hasChildren ? "<span aria-hidden=\"true\">" + (expanded ? "▾" : "▸") + "</span>" : "";
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTreeNode(node);
    });

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.nodeId = node.id;
    const typeClass = node.nodeType ? " node-type-" + node.nodeType : "";
    button.className =
      "node level-" +
      Math.min(depth, 5) +
      typeClass +
      (state.selectedId === node.id ? " is-selected" : "");

    const sub = nodeSub(node);
    const badge = publicStatus(node);
    const tagsBadge = (node.tags || []).length ? '<span class="badge badge-tags">теги</span>' : "";
    const subHtml = sub ? '<span class="node-sub">' + esc(sub) + "</span>" : "";
    const metaHtml =
      badge || tagsBadge
        ? '<span class="node-meta">' +
          (badge ? '<span class="badge">' + esc(badge) + "</span>" : "") +
          tagsBadge +
          "</span>"
        : "";

    button.innerHTML = [
      '<span class="node-text">',
      '<span class="node-title">' + esc(node.title) + "</span>",
      subHtml,
      "</span>",
      metaHtml,
    ].join("");
    button.addEventListener("click", () => openDetailsForNode(node, button));

    row.appendChild(toggle);
    row.appendChild(button);
    branch.appendChild(row);

    if (childrenNodes.length && expanded) {
      const children = document.createElement("div");
      children.className = "children";
      children.appendChild(renderTreeNodes(childrenNodes, depth + 1));
      branch.appendChild(children);
    }

    fragment.appendChild(branch);
  }

  return fragment;
}

function renderTree(focusToggleId = "") {
  els.tree.replaceChildren(renderTreeNodes(tree));
  syncSelectionStyles();
  if (focusToggleId) {
    requestAnimationFrame(() => {
      document.querySelector('[data-tree-toggle-id="' + focusToggleId + '"]')?.focus({ preventScroll: true });
    });
  }
}

/* Accessible in-page tabs */

function viewFromHash() {
  const value = window.location.hash.replace(/^#/, "");
  return VIEW_NAMES.includes(value) ? value : "structure";
}

function activateView(view) {
  const nextView = VIEW_NAMES.includes(view) ? view : "structure";
  els.body.classList.add("view-changing");
  state.view = nextView;
  els.body.dataset.view = nextView;

  for (const tab of els.tabs) {
    const active = tab.dataset.viewTab === nextView;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }

  for (const panel of els.panels) {
    panel.hidden = panel.dataset.viewPanel !== nextView;
  }

  state.detailsOpen = false;
  applyDetailsState(false);

  if (nextView === "menu") {
    renderMenu();
  } else if (nextView === "mindmap") {
    requestAnimationFrame(() => renderMindMap({ fit: !state.mapHasFit }));
  } else {
    showDetails(nodeById.get(state.selectedId) || firstTopNode || root);
    syncSelectionStyles();
  }

  requestAnimationFrame(() => els.body.classList.remove("view-changing"));
}

function selectView(view) {
  const targetHash = "#" + view;
  if (window.location.hash === targetHash) activateView(view);
  else window.location.hash = view;
}

for (const tab of els.tabs) {
  tab.addEventListener("click", () => selectView(tab.dataset.viewTab));
  tab.addEventListener("keydown", (event) => {
    const currentIndex = els.tabs.indexOf(tab);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % els.tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + els.tabs.length) % els.tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = els.tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = els.tabs[nextIndex];
    nextTab.focus();
    selectView(nextTab.dataset.viewTab);
  });
}

window.addEventListener("hashchange", () => activateView(viewFromHash()));

/* Future catalog menu */

function topMenuNodes() {
  return visibleChildren(root);
}

function chooseDefaultMiddle(topNode) {
  const children = visibleChildren(topNode);
  return children.find((node) => visibleChildren(node).length)?.id || "";
}

function ensureMenuSelection() {
  const topNodes = topMenuNodes();
  if (!topNodes.some((node) => node.id === state.activeTopId)) {
    state.activeTopId = topNodes[0]?.id || "";
  }

  const activeTop = nodeById.get(state.activeTopId);
  const middleNodes = visibleChildren(activeTop);
  if (!middleNodes.some((node) => node.id === state.activeMiddleId && visibleChildren(node).length)) {
    state.activeMiddleId = chooseDefaultMiddle(activeTop);
  }
}

function drillTop(node) {
  state.activeTopId = node.id;
  state.activeMiddleId = chooseDefaultMiddle(node);
  renderMenu({ focusNodeId: node.id });
}

function drillMiddle(node) {
  state.activeMiddleId = node.id;
  renderMenu({ focusNodeId: node.id });
}

function createMenuItem(node, options = {}) {
  const children = visibleChildren(node);
  const hasChildren = children.length > 0;
  const isGroup = node.nodeType === "menu-group";
  const item = document.createElement("li");
  item.className =
    "menu-item" +
    (options.active ? " is-active" : "") +
    (isGroup ? " is-group" : "");

  const main = document.createElement("button");
  main.type = "button";
  main.className = "menu-item-main";
  main.dataset.menuNodeId = node.id;
  main.textContent = node.title;
  if (options.active) main.setAttribute("aria-current", "true");

  if (isGroup && hasChildren) {
    main.setAttribute("aria-label", "Открыть раздел " + node.title);
    main.addEventListener("click", () => options.onDrill?.(node));
    item.appendChild(main);
    return item;
  }

  if (node.url) {
    main.setAttribute("title", "Открыть карточку раздела");
    main.addEventListener("click", () => openDetailsForNode(node, main));
  } else if (hasChildren) {
    main.addEventListener("click", () => options.onDrill?.(node));
  } else {
    main.disabled = true;
  }

  item.appendChild(main);

  if (hasChildren) {
    const drill = document.createElement("button");
    drill.type = "button";
    drill.className = "menu-item-drill";
    drill.setAttribute("aria-label", "Показать подразделы: " + node.title);
    drill.setAttribute("title", "Показать подразделы");
    drill.innerHTML = '<span aria-hidden="true">›</span>';
    drill.addEventListener("click", () => options.onDrill?.(node));
    item.appendChild(drill);
  }

  return item;
}

function createMenuColumn(title, nodes, options = {}) {
  const column = document.createElement("section");
  column.className = "mega-column";

  const heading = document.createElement("h2");
  heading.className = "mega-column-head";
  heading.textContent = title;
  column.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "menu-list";
  for (const node of nodes) {
    list.appendChild(
      createMenuItem(node, {
        active: options.activeId === node.id,
        onDrill: options.onDrill,
      }),
    );
  }
  column.appendChild(list);
  return column;
}

function createNestedMenu(nodes) {
  const list = document.createElement("ul");
  list.className = "nested-menu-list";

  for (const node of nodes) {
    const item = document.createElement("li");
    item.className = "nested-menu-item";

    if (node.url) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item-main";
      button.textContent = node.title;
      button.setAttribute("title", "Открыть карточку раздела");
      button.addEventListener("click", () => openDetailsForNode(node, button));
      item.appendChild(button);
    } else {
      const label = document.createElement("div");
      label.className = "nested-group-label";
      label.textContent = node.title;
      item.appendChild(label);
    }

    const children = visibleChildren(node);
    if (children.length) item.appendChild(createNestedMenu(children));
    list.appendChild(item);
  }

  return list;
}

function renderDesktopMenu() {
  ensureMenuSelection();
  const topNodes = topMenuNodes();
  const activeTop = nodeById.get(state.activeTopId) || topNodes[0];
  const middleNodes = visibleChildren(activeTop);
  const activeMiddle = nodeById.get(state.activeMiddleId);
  const deepNodes = activeMiddle ? visibleChildren(activeMiddle) : [];

  const grid = document.createElement("div");
  grid.className = "mega-grid" + (deepNodes.length ? "" : " is-two-column");
  grid.appendChild(
    createMenuColumn("Направления", topNodes, {
      activeId: activeTop?.id,
      onDrill: drillTop,
    }),
  );
  grid.appendChild(
    createMenuColumn(activeTop?.title || "Разделы", middleNodes, {
      activeId: activeMiddle?.id,
      onDrill: drillMiddle,
    }),
  );

  if (deepNodes.length) {
    const deepColumn = document.createElement("section");
    deepColumn.className = "mega-column";
    const heading = document.createElement("h2");
    heading.className = "mega-column-head";
    heading.textContent = activeMiddle.title;
    deepColumn.appendChild(heading);
    deepColumn.appendChild(createNestedMenu(deepNodes));
    grid.appendChild(deepColumn);
  }

  els.megaMenu.replaceChildren(grid);
}

function normalizeMenuPath() {
  if (!root) {
    state.menuPath = [];
    return;
  }

  if (!state.menuPath.length || state.menuPath[0] !== root.id) state.menuPath = [root.id];
  state.menuPath = state.menuPath.filter((id, index) => {
    if (!nodeById.has(id)) return false;
    if (index === 0) return id === root.id;
    const previous = nodeById.get(state.menuPath[index - 1]);
    return visibleChildren(previous).some((child) => child.id === id);
  });
  if (!state.menuPath.length) state.menuPath = [root.id];
}

function renderMobileMenu() {
  normalizeMenuPath();
  const current = nodeById.get(state.menuPath[state.menuPath.length - 1]) || root;
  const wrapper = document.createElement("div");
  wrapper.className = "menu-mobile";

  const head = document.createElement("div");
  head.className = "menu-mobile-head" + (current === root ? " is-root" : "");

  if (current !== root) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "menu-back";
    back.setAttribute("aria-label", "Вернуться на уровень выше");
    back.setAttribute("title", "Назад");
    back.innerHTML = '<span aria-hidden="true">←</span>';
    back.addEventListener("click", () => {
      const leavingNodeId = state.menuPath.pop();
      renderMenu({ focusNodeId: leavingNodeId });
    });
    head.appendChild(back);
  }

  const title = document.createElement("h2");
  title.className = "menu-current-title";
  title.textContent = current?.title || "Каталог продукции";
  head.appendChild(title);

  if (current !== root) {
    const spacer = document.createElement("span");
    spacer.setAttribute("aria-hidden", "true");
    head.appendChild(spacer);
  }

  wrapper.appendChild(head);

  const listWrap = document.createElement("div");
  listWrap.className = "menu-mobile-list";
  const list = document.createElement("ul");
  list.className = "menu-list";

  for (const node of visibleChildren(current)) {
    list.appendChild(
      createMenuItem(node, {
        onDrill: (target) => {
          state.menuPath.push(target.id);
          renderMenu({ focusSelector: ".menu-back" });
        },
      }),
    );
  }

  listWrap.appendChild(list);
  wrapper.appendChild(listWrap);
  els.megaMenu.replaceChildren(wrapper);
}

function renderMenu(options = {}) {
  if (!els.megaMenu) return;
  els.catalogToggle.setAttribute("aria-expanded", String(state.menuOpen));
  els.catalogToggle.setAttribute("aria-label", state.menuOpen ? "Скрыть меню каталога" : "Показать меню каталога");
  els.catalogToggle.setAttribute("title", state.menuOpen ? "Скрыть меню каталога" : "Показать меню каталога");
  els.megaMenu.hidden = !state.menuOpen;
  if (!state.menuOpen) return;

  if (mobileMenu.matches) renderMobileMenu();
  else renderDesktopMenu();

  if (options.focusNodeId || options.focusSelector) {
    requestAnimationFrame(() => {
      const selector = options.focusSelector || '[data-menu-node-id="' + options.focusNodeId + '"]';
      els.megaMenu.querySelector(selector)?.focus({ preventScroll: true });
    });
  }
}

els.catalogRoot.addEventListener("click", () => openDetailsForNode(root, els.catalogRoot));
els.catalogToggle.addEventListener("click", () => {
  state.menuOpen = !state.menuOpen;
  renderMenu();
});

/* Bilateral classic mind map */

function fullSubtreeWeight(node) {
  return 1 + visibleChildren(node).reduce((sum, child) => sum + fullSubtreeWeight(child), 0);
}

function buildTopSideMap() {
  const sides = new Map();
  let leftWeight = 0;
  let rightWeight = 0;

  for (const node of topMenuNodes()) {
    const weight = fullSubtreeWeight(node);
    const side = leftWeight <= rightWeight ? "left" : "right";
    sides.set(node.id, side);
    if (side === "left") leftWeight += weight;
    else rightWeight += weight;
  }

  return sides;
}

const topSideById = buildTopSideMap();

function topAncestor(node) {
  let current = node;
  let parent = parentById.get(current.id);
  while (parent && parent !== root) {
    current = parent;
    parent = parentById.get(current.id);
  }
  return current;
}

function mapSide(node) {
  if (!node || node === root) return "root";
  return topSideById.get(topAncestor(node).id) || "right";
}

function visibleMapChildren(node) {
  return state.mapExpanded.has(node.id) ? visibleChildren(node) : [];
}

function collectVisibleMapNodes(node, output = []) {
  if (!node) return output;
  output.push(node);
  for (const child of visibleMapChildren(node)) collectVisibleMapNodes(child, output);
  return output;
}

function mapFlagsHtml(node) {
  const flags = [];
  if (node.status === "На согласование") flags.push("На согласование");
  if ((node.tags || []).length) flags.push("теги");
  return flags.map((flag) => '<span class="map-flag">' + esc(flag) + "</span>").join("");
}

function renderMindMap(options = {}) {
  if (!root || state.view !== "mindmap") return;
  const token = ++state.mapRenderToken;
  const nodes = collectVisibleMapNodes(root);
  els.mapNodes.replaceChildren();
  els.mapLines.replaceChildren();

  for (const node of nodes) {
    const side = mapSide(node);
    const wrapper = document.createElement("div");
    wrapper.className =
      "map-node-shell side-" +
      side +
      " node-type-" +
      (node.nodeType || "product");
    wrapper.dataset.mapNodeId = node.id;

    const card = document.createElement("button");
    card.type = "button";
    card.dataset.nodeId = node.id;
    card.className = "map-node-card" + (state.selectedId === node.id ? " is-selected" : "");
    card.innerHTML =
      '<span class="map-node-title">' +
      esc(node.title) +
      '</span><span class="map-node-flags">' +
      mapFlagsHtml(node) +
      "</span>";
    card.addEventListener("click", () => openDetailsForNode(node, card));
    wrapper.appendChild(card);

    const children = visibleChildren(node);
    if (children.length && node !== root) {
      const expanded = state.mapExpanded.has(node.id);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "map-node-toggle";
      toggle.dataset.mapToggleId = node.id;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", expanded ? "Свернуть ветвь " + node.title : "Раскрыть ветвь " + node.title);
      toggle.setAttribute("title", expanded ? "Свернуть ветвь" : "Раскрыть ветвь");
      toggle.innerHTML = '<span aria-hidden="true">' + (expanded ? "−" : "+") + "</span>";
      toggle.addEventListener("click", () => {
        if (expanded) state.mapExpanded.delete(node.id);
        else state.mapExpanded.add(node.id);
        els.mapStatus.textContent = expanded ? "Ветвь свернута: " + node.title : "Ветвь раскрыта: " + node.title;
        renderMindMap({ fit: true, focusId: node.id });
      });
      wrapper.appendChild(toggle);
    }

    els.mapNodes.appendChild(wrapper);
  }

  requestAnimationFrame(() => {
    if (token !== state.mapRenderToken || state.view !== "mindmap") return;
    layoutMindMap(nodes);
    if (options.fit || !state.mapHasFit) fitMap({ readable: mobileMenu.matches });
    if (options.focusId) {
      document.querySelector('[data-map-toggle-id="' + options.focusId + '"]')?.focus({ preventScroll: true });
    }
  });
}

function layoutMindMap(nodes) {
  const wrappers = new Map();
  const dimensions = new Map();
  const positions = new Map();

  for (const node of nodes) {
    const wrapper = els.mapNodes.querySelector('[data-map-node-id="' + node.id + '"]');
    if (!wrapper) continue;
    wrappers.set(node.id, wrapper);
    dimensions.set(node.id, {
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
    });
  }

  const verticalGap = mobileMenu.matches ? 16 : 18;
  const branchGap = mobileMenu.matches ? 26 : 34;
  const columnStep = mobileMenu.matches ? 264 : 292;
  const rootGap = mobileMenu.matches ? 36 : 104;
  const heightMemo = new Map();

  function subtreeHeight(node) {
    if (heightMemo.has(node.id)) return heightMemo.get(node.id);
    const ownHeight = dimensions.get(node.id)?.height || 52;
    const children = visibleMapChildren(node);
    if (!children.length) {
      heightMemo.set(node.id, ownHeight);
      return ownHeight;
    }

    const childrenHeight =
      children.reduce((sum, child) => sum + subtreeHeight(child), 0) +
      verticalGap * Math.max(0, children.length - 1);
    const height = Math.max(ownHeight, childrenHeight);
    heightMemo.set(node.id, height);
    return height;
  }

  const rootDimensions = dimensions.get(root.id) || { width: 244, height: 64 };
  positions.set(root.id, {
    x: -rootDimensions.width / 2,
    y: -rootDimensions.height / 2,
    width: rootDimensions.width,
    height: rootDimensions.height,
  });

  function placeSubtree(node, side, depth, top) {
    const dimensionsForNode = dimensions.get(node.id) || { width: 220, height: 52 };
    const totalHeight = subtreeHeight(node);
    const x =
      side === "right"
        ? rootDimensions.width / 2 + rootGap + (depth - 1) * columnStep
        : -rootDimensions.width / 2 - rootGap - dimensionsForNode.width - (depth - 1) * columnStep;
    const y = top + (totalHeight - dimensionsForNode.height) / 2;

    positions.set(node.id, {
      x,
      y,
      width: dimensionsForNode.width,
      height: dimensionsForNode.height,
    });

    const children = visibleMapChildren(node);
    if (!children.length) return;

    const childrenBlockHeight =
      children.reduce((sum, child) => sum + subtreeHeight(child), 0) +
      verticalGap * Math.max(0, children.length - 1);
    let childTop = top + (totalHeight - childrenBlockHeight) / 2;

    for (const child of children) {
      placeSubtree(child, side, depth + 1, childTop);
      childTop += subtreeHeight(child) + verticalGap;
    }
  }

  const topNodes = visibleMapChildren(root);
  const leftNodes = topNodes.filter((node) => mapSide(node) === "left");
  const rightNodes = topNodes.filter((node) => mapSide(node) === "right");

  function placeSide(nodesForSide, side) {
    const totalHeight =
      nodesForSide.reduce((sum, node) => sum + subtreeHeight(node), 0) +
      branchGap * Math.max(0, nodesForSide.length - 1);
    let top = -totalHeight / 2;

    for (const node of nodesForSide) {
      placeSubtree(node, side, 1, top);
      top += subtreeHeight(node) + branchGap;
    }
  }

  placeSide(leftNodes, "left");
  placeSide(rightNodes, "right");

  for (const [id, position] of positions) {
    const wrapper = wrappers.get(id);
    if (!wrapper) continue;
    wrapper.style.left = position.x + "px";
    wrapper.style.top = position.y + "px";
  }

  const svgNamespace = "http://www.w3.org/2000/svg";
  const lineFragment = document.createDocumentFragment();

  for (const node of nodes) {
    if (node === root) continue;
    const parent = parentById.get(node.id);
    const parentPosition = positions.get(parent?.id);
    const nodePosition = positions.get(node.id);
    if (!parentPosition || !nodePosition) continue;

    const side = mapSide(node);
    const startX = side === "right" ? parentPosition.x + parentPosition.width : parentPosition.x;
    const endX = side === "right" ? nodePosition.x : nodePosition.x + nodePosition.width;
    const startY = parentPosition.y + parentPosition.height / 2;
    const endY = nodePosition.y + nodePosition.height / 2;
    const controlX = startX + (endX - startX) * 0.5;

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("class", "mindmap-line side-" + side);
    path.setAttribute(
      "d",
      "M " +
        startX +
        " " +
        startY +
        " C " +
        controlX +
        " " +
        startY +
        ", " +
        controlX +
        " " +
        endY +
        ", " +
        endX +
        " " +
        endY,
    );
    lineFragment.appendChild(path);
  }

  els.mapLines.replaceChildren(lineFragment);

  const allPositions = Array.from(positions.values());
  const minX = Math.min(...allPositions.map((item) => item.x)) - 42;
  const maxX = Math.max(...allPositions.map((item) => item.x + item.width)) + 42;
  const minY = Math.min(...allPositions.map((item) => item.y)) - 42;
  const maxY = Math.max(...allPositions.map((item) => item.y + item.height)) + 42;
  state.mapBounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function applyMapTransform() {
  const transform = state.mapTransform;
  els.mapStage.style.transform =
    "translate(" + transform.x + "px, " + transform.y + "px) scale(" + transform.scale + ")";
}

function fitMap(options = {}) {
  if (!state.mapBounds || !els.mapViewport.clientWidth || !els.mapViewport.clientHeight) return;
  const padding = mobileMenu.matches ? 36 : 68;
  const viewportWidth = els.mapViewport.clientWidth;
  const viewportHeight = els.mapViewport.clientHeight;
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const naturalScale = Math.min(
    1.08,
    availableWidth / state.mapBounds.width,
    availableHeight / state.mapBounds.height,
  );
  const minimumScale = options.readable && mobileMenu.matches ? 0.76 : 0.22;
  const scale = Math.max(minimumScale, naturalScale);
  const centerX = (state.mapBounds.minX + state.mapBounds.maxX) / 2;
  const centerY = (state.mapBounds.minY + state.mapBounds.maxY) / 2;
  const readabilityClamped = options.readable && mobileMenu.matches && naturalScale < minimumScale;

  state.mapTransform = {
    scale,
    x: readabilityClamped ? viewportWidth / 2 : viewportWidth / 2 - centerX * scale,
    y: readabilityClamped ? viewportHeight / 2 : viewportHeight / 2 - centerY * scale,
  };
  state.mapHasFit = true;
  applyMapTransform();
}

function zoomMap(factor, clientX, clientY) {
  const rect = els.mapViewport.getBoundingClientRect();
  const originX = clientX == null ? rect.width / 2 : clientX - rect.left;
  const originY = clientY == null ? rect.height / 2 : clientY - rect.top;
  const previous = state.mapTransform.scale;
  const next = Math.max(0.22, Math.min(2, previous * factor));
  const worldX = (originX - state.mapTransform.x) / previous;
  const worldY = (originY - state.mapTransform.y) / previous;

  state.mapTransform = {
    scale: next,
    x: originX - worldX * next,
    y: originY - worldY * next,
  };
  applyMapTransform();
}

els.mapZoomOut.addEventListener("click", () => zoomMap(1 / 1.18));
els.mapZoomIn.addEventListener("click", () => zoomMap(1.18));
els.mapFit.addEventListener("click", () => fitMap({ readable: false }));
els.mapReset.addEventListener("click", () => {
  resetMapExpansion();
  state.mapHasFit = false;
  els.mapStatus.textContent = "Возвращено начальное раскрытие карты";
  renderMindMap({ fit: true });
});

els.mapViewport.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
  },
  { passive: false },
);

els.mapViewport.addEventListener("keydown", (event) => {
  if (event.target !== els.mapViewport) return;
  const panStep = 56;

  if (event.key === "ArrowLeft") state.mapTransform.x += panStep;
  else if (event.key === "ArrowRight") state.mapTransform.x -= panStep;
  else if (event.key === "ArrowUp") state.mapTransform.y += panStep;
  else if (event.key === "ArrowDown") state.mapTransform.y -= panStep;
  else if (event.key === "+" || event.key === "=") zoomMap(1.18);
  else if (event.key === "-") zoomMap(1 / 1.18);
  else if (event.key === "0") fitMap({ readable: false });
  else return;

  event.preventDefault();
  if (event.key.startsWith("Arrow")) applyMapTransform();
});

els.mapViewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  event.preventDefault();
  els.mapViewport.setPointerCapture(event.pointerId);
  els.mapViewport.classList.add("is-panning");
  state.mapPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: state.mapTransform.x,
    originY: state.mapTransform.y,
  };
});

els.mapViewport.addEventListener("pointermove", (event) => {
  if (!state.mapPan || state.mapPan.pointerId !== event.pointerId) return;
  event.preventDefault();
  state.mapTransform.x = state.mapPan.originX + event.clientX - state.mapPan.startX;
  state.mapTransform.y = state.mapPan.originY + event.clientY - state.mapPan.startY;
  applyMapTransform();
});

function endMapPan(event) {
  if (!state.mapPan || state.mapPan.pointerId !== event.pointerId) return;
  if (els.mapViewport.hasPointerCapture(event.pointerId)) els.mapViewport.releasePointerCapture(event.pointerId);
  state.mapPan = null;
  els.mapViewport.classList.remove("is-panning");
}

els.mapViewport.addEventListener("pointerup", endMapPan);
els.mapViewport.addEventListener("pointercancel", endMapPan);

let resizeFrame = 0;
const resizeObserver = new ResizeObserver(() => {
  if (state.view !== "mindmap" || !state.mapBounds) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => fitMap({ readable: mobileMenu.matches }));
});
resizeObserver.observe(els.mapViewport);

/* Shared events and initial render */

els.detailClose.addEventListener("click", () => closeDetails());
els.detailsBackdrop.addEventListener("click", () => closeDetails());

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && state.detailsOpen && detailsUseOverlay()) {
    event.preventDefault();
    els.detailClose.focus();
    return;
  }

  if (event.key !== "Escape") return;
  if (state.detailsOpen && detailsUseOverlay()) {
    closeDetails();
    return;
  }

  if (state.view === "menu" && state.menuOpen) {
    state.menuOpen = false;
    renderMenu();
    els.catalogToggle.focus();
  }
});

function onMediaChange() {
  state.detailsOpen = false;
  applyDetailsState(false);
  if (state.view === "menu") renderMenu();
  if (state.view === "mindmap") requestAnimationFrame(() => fitMap({ readable: mobileMenu.matches }));
}

if (typeof mobileDetails.addEventListener === "function") {
  mobileDetails.addEventListener("change", onMediaChange);
  mobileMenu.addEventListener("change", onMediaChange);
} else {
  mobileDetails.addListener(onMediaChange);
  mobileMenu.addListener(onMediaChange);
}

showDetails(nodeById.get(state.selectedId) || firstTopNode || root);
renderTree();

const initialView = viewFromHash();
if (!VIEW_NAMES.includes(window.location.hash.replace(/^#/, ""))) {
  history.replaceState(null, "", "#structure");
}
activateView(initialView);
