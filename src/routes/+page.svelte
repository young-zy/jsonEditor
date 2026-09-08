<script lang="ts">
	import { browser } from '$app/environment'
	import EditorWrapper from '$lib/editorWrapper.svelte'
	import { createCompareClassNames, parseEditorJson } from '$lib/compareJson'

	const THEME_KEY = 'json-editor-theme'

	let contentLeft = $state({
		text: undefined, // can be used to pass a stringified JSON document instead
		json: {}
	})
	let contentRight = $state({
		text: undefined, // can be used to pass a stringified JSON document instead
		json: {}
	})
	let compare = $state(false)
	let dark = $state(browser && localStorage.getItem(THEME_KEY) === 'dark')
	let syncScroll = $state(false)
	let leftPct = $state(50)
	let dragging = $state(false)
	let syncingScroll = false
	let editorsEl = $state<HTMLDivElement | undefined>(undefined)
	let gutterEl = $state<HTMLDivElement | undefined>(undefined)
	let paneAEl = $state<HTMLDivElement | undefined>(undefined)
	let paneBEl = $state<HTMLDivElement | undefined>(undefined)

	const MIN_PCT = 15
	const MAX_PCT = 85

	const jsonLeft = $derived(parseEditorJson(contentLeft))
	const jsonRight = $derived(parseEditorJson(contentRight))
	const compareClassNames = $derived(createCompareClassNames(jsonLeft, jsonRight, compare))

	$effect(() => {
		if (!browser) return
		localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
		document.documentElement.classList.toggle('jse-theme-dark', dark)
	})

	function findEditorScrollEl(root: HTMLElement | undefined): HTMLElement | null {
		if (!root) return null
		return (
			root.querySelector('[data-jsoneditor-scrollable-contents]') ||
			root.querySelector('.cm-scroller') ||
			root.querySelector('.jse-contents')
		)
	}

	function applyScroll(from: HTMLElement | undefined, to: HTMLElement | undefined) {
		const srcScroll = findEditorScrollEl(from)
		const dstScroll = findEditorScrollEl(to)
		if (!srcScroll || !dstScroll) return

		syncingScroll = true
		dstScroll.scrollTop = srcScroll.scrollTop
		dstScroll.scrollLeft = srcScroll.scrollLeft
		requestAnimationFrame(() => {
			syncingScroll = false
		})
	}

	function onPaneScroll(from: 'left' | 'right', event: Event) {
		if (!syncScroll || syncingScroll) return
		const src = event.target
		if (!(src instanceof HTMLElement)) return

		const srcPane = from === 'left' ? paneAEl : paneBEl
		const dstPane = from === 'left' ? paneBEl : paneAEl
		const srcScroll = findEditorScrollEl(srcPane)
		if (!srcPane || !dstPane || !srcScroll || !srcScroll.contains(src)) return

		applyScroll(srcPane, dstPane)
	}

	$effect(() => {
		const left = paneAEl
		const right = paneBEl
		if (!browser || !syncScroll || !left || !right) return
		applyScroll(left, right)
		const onLeft = (event: Event) => onPaneScroll('left', event)
		const onRight = (event: Event) => onPaneScroll('right', event)
		left.addEventListener('scroll', onLeft, true)
		right.addEventListener('scroll', onRight, true)
		return () => {
			left.removeEventListener('scroll', onLeft, true)
			right.removeEventListener('scroll', onRight, true)
		}
	})

	function clampPct(value: number) {
		return Math.min(MAX_PCT, Math.max(MIN_PCT, value))
	}

	function updateSplit(clientX: number) {
		if (!editorsEl || !gutterEl) return
		const rect = editorsEl.getBoundingClientRect()
		const gutter = gutterEl.getBoundingClientRect().width
		const usable = rect.width - gutter
		if (usable <= 0) return
		leftPct = clampPct(((clientX - rect.left) / usable) * 100)
	}

	function onHandlePointerDown(event: PointerEvent) {
		dragging = true
		const target = event.currentTarget as HTMLElement
		target.setPointerCapture(event.pointerId)
		updateSplit(event.clientX)
	}

	function onHandlePointerMove(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement
		if (!target.hasPointerCapture(event.pointerId)) return
		updateSplit(event.clientX)
	}

	function onHandlePointerUp(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId)
		}
		dragging = false
	}
</script>

<svelte:head>
	<title>Json Editor</title>
</svelte:head>

<div
	class="editors"
	class:dragging
	class:jse-theme-dark={dark}
	bind:this={editorsEl}
	style="grid-template-columns: minmax(0, {leftPct}fr) auto minmax(0, {100 - leftPct}fr)"
>
	{#snippet resizeHandle()}
		<button
			class="handle"
			type="button"
			aria-label="Resize editors"
			onpointerdown={onHandlePointerDown}
			onpointermove={onHandlePointerMove}
			onpointerup={onHandlePointerUp}
			onpointercancel={onHandlePointerUp}
		>
			<span class="handle-bar"></span>
		</button>
	{/snippet}

	<div class="pane" bind:this={paneAEl}>
		<EditorWrapper bind:content={contentLeft} onClassName={compareClassNames.left} />
	</div>
	<div class="gutter" bind:this={gutterEl}>
		{@render resizeHandle()}
		<div class="gutter-controls">
			<label class="compare">
				<input type="checkbox" bind:checked={compare} />
				compare
			</label>
			<label class="compare">
				<input type="checkbox" bind:checked={dark} />
				dark
			</label>
			<label class="compare">
				<input type="checkbox" bind:checked={syncScroll} />
				sync
			</label>
		</div>
		{@render resizeHandle()}
	</div>
	<div class="pane" bind:this={paneBEl}>
		<EditorWrapper bind:content={contentRight} onClassName={compareClassNames.right} />
	</div>
</div>

<style>
	.editors {
		display: grid;
		align-items: stretch;
		width: 100%;
		height: 100%;
		max-height: 100vh;
		overflow: hidden;
		box-sizing: border-box;
		background: var(--jse-background-color, #fff);
		color: var(--jse-text-color, #4d4d4d);
	}

	.editors.dragging {
		cursor: col-resize;
		user-select: none;
	}

	.pane {
		min-width: 0;
		min-height: 0;
		height: 100%;
		overflow: hidden;
	}

	.gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 72px;
		flex-shrink: 0;
	}

	.gutter-controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.compare {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex-shrink: 0;
		user-select: none;
		font-size: 14px;
	}

	.handle {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: col-resize;
		touch-action: none;
		border: none;
		padding: 0;
		background: transparent;
	}

	.handle-bar {
		width: 6px;
		height: 48px;
		border-radius: 3px;
		background: #d0d0d0;
	}

	.editors.jse-theme-dark .handle-bar {
		background: #555;
	}

	.handle:hover .handle-bar,
	.editors.dragging .handle-bar {
		background: var(--jse-theme-color, #3883fa);
	}

	:global(.jse-diff-changed) {
		--jse-contents-background-color: #fff3bf;
		--jse-selection-background-color: #ffe066;
		--jse-hover-background-color: #ffe8a3;
	}

	:global(.jse-json-node.jse-diff-parent > .jse-header-outer > .jse-header) {
		background: #fff3bf;
	}

	:global(.jse-theme-dark .jse-diff-changed) {
		--jse-contents-background-color: #5c4d1f;
		--jse-selection-background-color: #7a6524;
		--jse-hover-background-color: #6b5921;
	}

	:global(.jse-theme-dark .jse-json-node.jse-diff-parent > .jse-header-outer > .jse-header) {
		background: #5c4d1f;
	}

	:global(.jse-theme-dark .jse-diff-removed) {
		--jse-contents-background-color: #5c2a2a;
		--jse-selection-background-color: #7a3838;
		--jse-hover-background-color: #6b3131;
	}

	:global(.jse-theme-dark .jse-diff-added) {
		--jse-contents-background-color: #1e4d2b;
		--jse-selection-background-color: #2a6b3a;
		--jse-hover-background-color: #245833;
	}

	:global(.jse-diff-removed) {
		--jse-contents-background-color: #ffc9c9;
		--jse-selection-background-color: #ffa8a8;
		--jse-hover-background-color: #ffd0d0;
	}

	:global(.jse-diff-added) {
		--jse-contents-background-color: #b2f2bb;
		--jse-selection-background-color: #8ce99a;
		--jse-hover-background-color: #d3f9d8;
	}
</style>
