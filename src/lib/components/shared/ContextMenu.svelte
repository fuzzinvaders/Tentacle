<script lang="ts">
	import { contextMenu } from '$lib/stores/contextMenu.svelte';

	let menuEl = $state<HTMLDivElement>();

	// Position ajustée pour rester dans le viewport (on mesure après rendu).
	let pos = $state({ x: 0, y: 0 });
	$effect(() => {
		if (!contextMenu.visible) return;
		const x = contextMenu.x;
		const y = contextMenu.y;
		queueMicrotask(() => {
			const el = menuEl;
			if (!el) {
				pos = { x, y };
				return;
			}
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			const maxX = window.innerWidth - w - 8;
			const maxY = window.innerHeight - h - 8;
			pos = { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
		});
	});

	function run(fn: () => void) {
		contextMenu.close();
		fn();
	}
</script>

{#if contextMenu.visible}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="ctx-backdrop"
		oncontextmenu={(e) => {
			e.preventDefault();
			contextMenu.close();
		}}
		onclick={() => contextMenu.close()}
	></div>
	<div
		bind:this={menuEl}
		class="ctx-menu scanlines"
		style:left={`${pos.x}px`}
		style:top={`${pos.y}px`}
		role="menu"
		tabindex={-1}
	>
		{#if contextMenu.title}
			<div class="ctx-title">{contextMenu.title}</div>
		{/if}
		{#each contextMenu.items as item (item.label)}
			<button
				type="button"
				class="ctx-item"
				class:is-danger={item.danger}
				role="menuitem"
				onclick={() => run(item.run)}
			>
				{#if item.icon}<span class="ctx-icon">{item.icon}</span>{/if}
				<span>{item.label}</span>
			</button>
		{/each}
	</div>
{/if}

<svelte:window
	onkeydown={(e) => {
		if (contextMenu.visible && e.key === 'Escape') contextMenu.close();
	}}
	onscroll={() => contextMenu.visible && contextMenu.close()}
/>

<style>
	.ctx-backdrop {
		position: fixed;
		inset: 0;
		z-index: 320;
	}

	.ctx-menu {
		position: fixed;
		z-index: 321;
		min-width: 12rem;
		max-width: 16rem;
		background: var(--plum-deep);
		border: 3px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: 5px 6px 0 0 var(--shadow);
		padding: 0.3rem;
		display: flex;
		flex-direction: column;
		font-family: var(--font-pixel);
	}

	.ctx-title {
		font-size: 0.72rem;
		color: var(--muted);
		padding: 0.35rem 0.5rem;
		border-bottom: 2px solid var(--bezel);
		margin-bottom: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ctx-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: none;
		border: none;
		color: var(--cream);
		padding: 0.5rem 0.55rem;
		cursor: pointer;
		text-align: left;
		font-size: 0.82rem;
		border-radius: var(--radius-control, 0);
	}

	.ctx-item:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.ctx-item.is-danger:hover {
		color: var(--coral);
	}

	.ctx-icon {
		width: 1.2rem;
		text-align: center;
		flex-shrink: 0;
	}
</style>
