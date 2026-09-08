<script lang="ts">
	import {
		JSONEditor,
		isTextContent,
		toJSONContent,
		toTextContent,
		type JSONEditorPropsOptional
	} from 'svelte-jsoneditor'
	import type { Snippet } from 'svelte'

	type CopyMode = 'formatted' | 'compacted' | 'escaped' | 'as-is'

	const copyOptions: { mode: CopyMode; label: string }[] = [
		{ mode: 'formatted', label: 'copy formatted' },
		{ mode: 'compacted', label: 'copy compacted' },
		{ mode: 'escaped', label: 'copy escaped' },
		{ mode: 'as-is', label: 'copy as-is' }
	]

	let {
		content = $bindable(),
		selection = $bindable(),
		children,
		...rest
	}: JSONEditorPropsOptional & { children?: Snippet } = $props()

	let copyMode = $state<CopyMode>('as-is')
	let menuOpen = $state(false)
	let copied = $state(false)
	let copyGroupEl: HTMLDivElement | undefined

	function getAsIsText(): string {
		if (!content) return ''
		if (isTextContent(content)) return content.text ?? ''
		return toTextContent(content, rest.indentation ?? 2).text
	}

	function serialize(mode: CopyMode): string {
		if (!content) return ''
		if (mode === 'as-is') return getAsIsText()

		const json = toJSONContent(content).json
		if (mode === 'formatted') return JSON.stringify(json, null, rest.indentation ?? 2)
		if (mode === 'compacted') return JSON.stringify(json)
		return JSON.stringify(JSON.stringify(json))
	}

	async function copy(mode: CopyMode = copyMode) {
		copyMode = mode
		menuOpen = false
		try {
			await navigator.clipboard.writeText(serialize(mode))
			copied = true
			setTimeout(() => {
				copied = false
			}, 1200)
		} catch (error) {
			console.error(error)
		}
	}

	function toggleMenu(event: MouseEvent) {
		event.stopPropagation()
		menuOpen = !menuOpen
	}

	function handleWindowClick(event: MouseEvent) {
		if (!copyGroupEl?.contains(event.target as Node)) {
			menuOpen = false
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="editor-wrapper">
	<div class="toolbar">
		<div class="toolbar-start">
			{@render children?.()}
		</div>
		<div class="copy-group" bind:this={copyGroupEl}>
			<button class="copy-btn" type="button" onclick={() => copy()}>
				{copied ? 'Copied' : 'Copy'}
			</button>
			<button
				class="copy-chevron"
				type="button"
				aria-haspopup="listbox"
				aria-expanded={menuOpen}
				onclick={toggleMenu}
			>
				▾
			</button>
			{#if menuOpen}
				<ul class="copy-menu" role="listbox">
					{#each copyOptions as option (option.mode)}
						<li>
							<button
								class:selected={copyMode === option.mode}
								type="button"
								onclick={() => copy(option.mode)}
							>
								{option.label}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
	<div class="editor">
		<JSONEditor {...rest} bind:content bind:selection />
	</div>
</div>

<style>
	.editor-wrapper {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
		/*--jse-main-border: none;*/
		/*--jse-panel-border: none;*/
	}

	.toolbar {
		height: 48px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		box-sizing: border-box;
		padding: 0 8px;
		background: var(--jse-theme-color, #3883fa);
		color: var(--jse-menu-color, var(--jse-text-color-inverse, #fff));
	}

	.toolbar-start {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		height: 100%;
	}

	.copy-group {
		position: relative;
		display: flex;
		align-items: stretch;
		flex-shrink: 0;
		margin-left: auto;
	}

	.copy-btn,
	.copy-chevron {
		font: inherit;
		color: inherit;
		background: transparent;
		border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
		cursor: pointer;
		height: 32px;
	}

	.copy-btn {
		padding: 0 12px;
		border-right: none;
		border-radius: 4px 0 0 4px;
	}

	.copy-chevron {
		width: 28px;
		border-radius: 0 4px 4px 0;
	}

	.copy-btn:hover,
	.copy-chevron:hover {
		background: var(--jse-theme-color-highlight, #5f9dff);
	}

	.copy-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 20;
		margin: 0;
		padding: 4px 0;
		list-style: none;
		min-width: 180px;
		background: var(--jse-context-menu-background, #fff);
		color: var(--jse-context-menu-color, #333);
		border-radius: 4px;
		box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
	}

	.copy-menu button {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.copy-menu button:hover,
	.copy-menu button.selected {
		background: var(--jse-context-menu-background-highlight, #f0f4ff);
	}

	.editor {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.editor :global(.jse-main) {
		height: 100%;
	}
</style>
