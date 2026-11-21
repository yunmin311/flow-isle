<script setup lang="ts">
export type CompanionEmoteKind = 'mail' | 'notif' | 'heart' | 'music' | 'sleep'

withDefaults(defineProps<{ kind: CompanionEmoteKind; compact?: boolean }>(), {
  compact: false,
})
</script>

<template>
  <span class="companion-emote" :class="[`kind-${kind}`, { compact }]" aria-hidden="true">
    <!-- Pixel Envelope (mail) -->
    <svg v-if="kind === 'mail'" width="9" height="7" viewBox="0 0 9 7" fill="currentColor" shape-rendering="crispEdges">
      <rect x="0" y="0" width="9" height="1" /><rect x="0" y="6" width="9" height="1" />
      <rect x="0" y="1" width="1" height="5" /><rect x="8" y="1" width="1" height="5" />
      <rect x="1" y="1" width="1" height="1" /><rect x="7" y="1" width="1" height="1" />
      <rect x="2" y="2" width="1" height="1" /><rect x="6" y="2" width="1" height="1" />
      <rect x="3" y="3" width="3" height="1" />
    </svg>

    <!-- Pixel Exclamation (notif) -->
    <svg v-else-if="kind === 'notif'" width="5" height="8" viewBox="0 0 5 8" fill="currentColor" shape-rendering="crispEdges">
      <rect x="2" y="0" width="1" height="5" />
      <rect x="2" y="6" width="1" height="2" />
    </svg>

    <!-- Pixel Heart (task-done / done / pet) -->
    <svg v-else-if="kind === 'heart'" width="7" height="6" viewBox="0 0 7 6" fill="currentColor" shape-rendering="crispEdges">
      <rect x="1" y="0" width="2" height="1" /><rect x="4" y="0" width="2" height="1" />
      <rect x="0" y="1" width="7" height="2" />
      <rect x="1" y="3" width="5" height="1" />
      <rect x="2" y="4" width="3" height="1" />
      <rect x="3" y="5" width="1" height="1" />
    </svg>

    <!-- Pixel Music Note (radio playing) -->
    <svg v-else-if="kind === 'music'" width="7" height="8" viewBox="0 0 7 8" fill="currentColor" shape-rendering="crispEdges">
      <rect x="2" y="0" width="5" height="1" />
      <rect x="2" y="1" width="1" height="5" /><rect x="6" y="1" width="1" height="4" />
      <rect x="0" y="5" width="3" height="2" /><rect x="4" y="4" width="3" height="2" />
    </svg>

    <!-- Pixel Zzz (sleep / break / alert) -->
    <svg v-else width="8" height="7" viewBox="0 0 8 7" fill="currentColor" shape-rendering="crispEdges">
      <rect x="0" y="2" width="4" height="1" /><rect x="2" y="3" width="1" height="1" />
      <rect x="1" y="4" width="1" height="1" /><rect x="0" y="5" width="4" height="1" />
      <rect x="5" y="0" width="3" height="1" /><rect x="6" y="1" width="1" height="1" />
      <rect x="5" y="2" width="3" height="1" />
    </svg>
  </span>
</template>

<style scoped>
.companion-emote {
  position: absolute;
  top: -5px;
  right: -5px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  image-rendering: pixelated;
  filter: drop-shadow(0 1px 1px color-mix(in srgb, #000 26%, transparent));
}

.companion-emote.compact {
  top: -4px;
  right: -4px;
}

.companion-emote.kind-mail {
  color: var(--v2-accent);
  animation: emote-pop-bob 0.9s steps(2, end) infinite;
}

.companion-emote.kind-notif {
  color: var(--v2-alert);
  animation: emote-pop-bob 0.8s steps(2, end) infinite;
}

.companion-emote.kind-heart {
  color: var(--v2-accent);
  animation: emote-float-up 1.1s steps(3, end) infinite;
}

.companion-emote.kind-music {
  color: var(--v2-accent);
  animation: emote-music-sway 1.4s steps(2, end) infinite;
}

.companion-emote.kind-sleep {
  color: var(--v2-muted);
  animation: emote-sleep-drift 2.2s steps(3, end) infinite;
}

@keyframes emote-pop-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes emote-float-up {
  0% { transform: translateY(1px); opacity: 1; }
  65% { transform: translateY(-3px); opacity: 1; }
  100% { transform: translateY(-4px); opacity: 0.35; }
}

@keyframes emote-music-sway {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(1px, -2px); }
}

@keyframes emote-sleep-drift {
  0%, 100% { transform: translate(0, 0); opacity: 0.55; }
  50% { transform: translate(1px, -2px); opacity: 0.95; }
}

@media (prefers-reduced-motion: reduce) {
  .companion-emote {
    animation: none !important;
  }
}
</style>
