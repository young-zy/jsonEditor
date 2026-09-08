<script lang="ts">
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		if (!pwaInfo) return;
		void import('virtual:pwa-register').then(({ registerSW }) => {
			registerSW({ immediate: true });
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if pwaInfo}
		<link
			rel="manifest"
			href={pwaInfo.webManifest.href}
			crossorigin={pwaInfo.webManifest.useCredentials ? 'use-credentials' : undefined}
		/>
	{/if}
</svelte:head>
{@render children()}
