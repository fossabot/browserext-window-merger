/** @type {number[]} */
const focusOrder = [];

browser.windows.onFocusChanged.addListener(drawMenus);
browser.menus.onClicked.addListener((menuItem, currentTab) => {
	const { windowId, id, index } = currentTab ?? {};
	if (windowId === undefined || id === undefined || index === undefined) {
		return;
	}
	if (menuItem.menuItemId === "merge_all") {
		getWindowsSorted(true).then((windows) =>
			merge(windows.slice(1), windowId, id, index),
		);
	} else if (`${menuItem.menuItemId}`.substr(0, 11) === "merge_into_") {
		const targetWindow = parseInt(`${menuItem.menuItemId}`.substr(11), 10);
		Promise.all([
			browser.tabs.query({ highlighted: true, windowId: windowId }),
			browser.tabs.query({ active: true, windowId: targetWindow }),
		]).then(([tabs, [{ id, index }]]) => {
			if (currentTab && id && index)
				merge(
					[{ tabs: [...new Set(tabs.concat([currentTab]))] }],
					targetWindow,
					id,
					index,
				);
		});
	} else if (`${menuItem.menuItemId}`.substr(0, 6) === "merge_") {
		browser.windows
			.get(parseInt(`${menuItem.menuItemId}`.substr(6), 10), { populate: true })
			.then((subject) => merge([subject], windowId, id, index));
	}
});
browser.commands.onCommand.addListener((command) => {
	Promise.all([
		browser.tabs.query({ active: true, currentWindow: true }),
		getWindowsSorted(true),
	]).then(([[{ windowId, id, index }], windows]) => {
		if (windowId && id)
			merge(
				command === "merge-all-windows"
					? windows.slice(1)
					: windows.slice(1, 1),
				windowId,
				id,
				index,
			);
	});
});

/**
 * @param {number} [focusedId] The windows.Window object ID that last gained focus
 */
function drawMenus(focusedId) {
	if (focusedId === browser.windows.WINDOW_ID_NONE) return;
	if (typeof focusedId === "number") {
		const removeFrom = focusOrder.indexOf(focusedId);
		if (removeFrom !== -1) focusOrder.splice(removeFrom, 1);
		focusOrder.unshift(focusedId);
	}
	Promise.all([
		getWindowsSorted(),
		browser.storage.local.get({
			menu_location: ["all", "tab", "tools_menu"],
			experimental: [],
		}),
		browser.menus.removeAll(),
	]).then(
		([
			windows,
			{
				menu_location: menuLocations,
				experimental: [experimental],
			},
		]) => {
			if (windows.length < 2) return;
			const parentId = browser.menus.create({
				title: "Merge Windows",
				contexts: menuLocations,
			});
			const parentIdTabs =
				experimental &&
				browser.menus.create({
					title: "Merge Tab into...",
					contexts: ["tab"],
				});
			browser.menus.create({
				title: "Merge all windows into this one",
				id: "merge_all",
				parentId,
			});
			browser.menus.create({
				type: "separator",
				parentId,
			});
			windows.slice(1).forEach((window) => {
				const prefix = window.state === "minimized" ? "♢ " : "\u2003 ";
				browser.menus.create({
					title: `${prefix} Merge·tabs·from·${window.title}`,
					id: `merge_${window.id}`,
					parentId,
				});
				experimental &&
					browser.menus.create({
						title: `${prefix} ...·${window.title}`,
						id: `merge_into_${window.id}`,
						parentId: parentIdTabs,
					});
			});
		},
	);
}

/**
 * @param {boolean} [populate=false] Whether to populate windows.Window objects with tab information
 * @returns {Promise<ReadonlyArray<browser.windows.Window>>}
 */
async function getWindowsSorted(populate = false) {
	const windows = await browser.windows.getAll({
		windowTypes: ["normal"],
		populate,
	});
	windows.sort(
		(a, b) =>
			(focusOrder.indexOf(a.id ?? NaN) ?? Infinity) -
			(focusOrder.indexOf(b.id ?? NaN) ?? Infinity),
	);
	const isIncognito = windows[0].incognito;
	return windows.filter(
		({ id, incognito }) => id !== undefined && incognito === isIncognito,
	);
}

/**
 * @param {ReadonlyArray<Pick<browser.windows.Window, "tabs">>} subjects Array of populated windows.Window objects
 * @param {number} target Window ID to merge all subjects’ tabs into
 * @param {number} active Tab ID of the active tab after merge
 * @param {number} activeIndex Index of the active tab
 */
function merge(subjects, target, active, activeIndex) {
	const tabs = subjects.flatMap((window) => window.tabs ?? []);
	Promise.all(
		[browser.storage.local.get({ merge_insertion: ["0"] })].concat(
			tabs
				.filter((tab) => tab.pinned)
				.map((tab) =>
					tab.id
						? browser.tabs.update(tab.id, { pinned: false })
						: Promise.reject(),
				),
		),
	).then(([{ merge_insertion: mergeInsertion }, ...unpinned]) => {
		const moveIndex = mergeInsertion.pop() === "0" ? -1 : ++activeIndex;
		const moveList = tabs.map((tab) => tab.id).filter((id) => id !== undefined);
		if (moveIndex !== -1) moveList.reverse();
		browser.tabs
			.move(moveList, { windowId: target, index: moveIndex })
			.then(() => {
				browser.tabs.update(active, { active: true });
				unpinned.forEach((tab) => {
					browser.tabs.update(tab.id, { pinned: true });
				});
			});
	});
}

browser.storage.onChanged.addListener((changes) => {
	if (["menu_location", "experimental"].some((a) => a in changes)) drawMenus();
});

browser.runtime.onInstalled.addListener(() => {
	browser.storage.local
		.get(["context_menu_location", "merge_insertion"])
		.then(
			({ context_menu_location: oldLocation, merge_insertion: oldMerge }) => {
				const save = {};
				if (Number.isInteger(oldLocation)) {
					save.menu_location = [["all"], ["tab"], ["all", "tab"]][oldLocation];
					browser.storage.local.remove("context_menu_location");
				}
				if (Number.isInteger(oldMerge)) {
					save.merge_insertion = [oldMerge.toString()];
				}
				browser.storage.local.set(save);
			},
		);
});
