/**
 * @param {Record<string, ReadonlyArray<string> | browser.storage.StorageChange>} state The internal preferences state from storage
 */
function updateForm(state) {
	for (const name in state) {
		document.querySelectorAll(`[name="${name}"]`).forEach((element) => {
			if (element instanceof HTMLInputElement === false) return;
			element.checked = (
				Array.isArray(state[name]) ? state[name] : state[name].newValue
			).includes(element.value);
		});
	}
}

browser.storage.local
	.get({
		menu_location: ["all", "tab", "tools_menu"],
		merge_insertion: ["0"],
		experimental: [],
	})
	.then(updateForm);

document.body.addEventListener("change", ({ target }) => {
	if (target instanceof HTMLInputElement === false) return;
	/** @type {Record<string, ReadonlyArray<string>>} */
	const save = {};
	save[target.name] = Array.from(
		document.querySelectorAll(`[name="${target.name}"]:checked`),
	).map((checkbox) =>
		checkbox instanceof HTMLInputElement ? checkbox.value : "",
	);
	browser.storage.local.set(save);
});

browser.storage.onChanged.addListener(updateForm);
