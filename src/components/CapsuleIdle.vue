<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useTasks } from "../composables/useTasks";
import { useSettings } from "../composables/useSettings";
import { useCompanion, resolveIslandCompanionSprite } from "../composables/useCompanion";
import { useIslandState } from "../composables/useIslandState";
import { PIXEL_3X5, layoutPixelText } from "../utils/pixelFont";

const { recentFocusTasks } = useTasks();
const { settings } = useSettings();
const { selectedCompanion } = useCompanion();
const { state } = useIslandState();

const props = defineProps<{ radioPlaying?: boolean }>();

const isAlert = computed(() => state.value === "alert");

const DEFAULT_MOTTOS = [
    "深呼吸，然后开始",
    "专注当下，一次一件事",
    "每一步都算数",
    "你比想象中更有能力",
    "保持节奏，持续前进",
    "休息也是生产力的一部分",
    "今天的努力，明天的底气",
    "把大象切成小块吃",
    "做完比做好更重要",
    "心流就在下一个番茄钟",
];

const mottos = computed(() => {
    const custom = settings.value.idleMottos;
    return custom && custom.length > 0 ? custom : DEFAULT_MOTTOS;
});

function pickRandomMottos(count: number): string[] {
    const pool = [...mottos.value];
    const result: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        result.push(pool.splice(idx, 1)[0]);
    }
    return result;
}

interface CarouselItem {
    key: string;
    type: "task" | "motto";
    text: string;
    pomodoroCount?: number;
}

const carouselItems = computed<CarouselItem[]>(() => {
    const tasks = recentFocusTasks.value;
    if (tasks.length === 0) {
        return mottos.value.map((m, i) => ({
            key: `motto-${i}`,
            type: "motto" as const,
            text: m,
        }));
    }
    const items: CarouselItem[] = tasks.map((t) => ({
        key: t.id,
        type: "task" as const,
        text: t.title,
        pomodoroCount: t.pomodoroCount,
    }));
    const randomMottos = pickRandomMottos(2);
    randomMottos.forEach((m, i) => {
        items.push({
            key: `motto-r-${i}-${m}`,
            type: "motto" as const,
            text: m,
        });
    });
    return items;
});

const carouselIndex = ref(0);
let carouselTimer: ReturnType<typeof setInterval> | null = null;

// 空闲态右上角实时时钟：对齐到整分钟刷新
const clock = ref("");
const minuteBucket = ref(0);
let clockTimer: ReturnType<typeof setTimeout> | null = null;

function updateClock() {
    const d = new Date();
    clock.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    minuteBucket.value = d.getHours() * 60 + d.getMinutes();
}

function scheduleClock() {
    updateClock();
    const d = new Date();
    const delay = (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 30;
    clockTimer = setTimeout(scheduleClock, delay);
}

// 固定 3px：与 CapsuleFocus 一致
const pixelUnit = 3;
const clockPixels = computed(() => layoutPixelText(clock.value, PIXEL_3X5, pixelUnit, 1));

const companionSprite = computed(() =>
    resolveIslandCompanionSprite(
        selectedCompanion.value,
        isAlert.value ? "alert" : "idle",
        minuteBucket.value,
    ),
);

watch(
    () => carouselItems.value.length,
    () => {
        carouselIndex.value = 0;
    },
);

const currentItem = computed(() => {
    const items = carouselItems.value;
    if (items.length === 0) return null;
    return items[carouselIndex.value % items.length];
});

onMounted(() => {
    carouselTimer = setInterval(() => {
        const len = carouselItems.value.length;
        if (len > 1) {
            carouselIndex.value = (carouselIndex.value + 1) % len;
        }
    }, 5000);
    scheduleClock();
});

onUnmounted(() => {
    if (carouselTimer) clearInterval(carouselTimer);
    if (clockTimer) clearTimeout(clockTimer);
});
</script>

<template>
    <div class="capsule-idle" :class="{ 'is-alert': isAlert }">
        <div class="idle-companion">
            <img
                class="companion-pixel"
                :src="companionSprite.url"
                :alt="selectedCompanion.name"
                width="18"
                height="18"
                :style="{
                    width: `calc(18px * var(--island-scale, 1))`,
                    height: `calc(18px * var(--island-scale, 1))`,
                }"
            />
            <span v-if="isAlert" class="alert-pip" aria-hidden="true" />
        </div>

        <div class="idle-center">
            <Transition name="carousel" mode="out-in">
                <div v-if="currentItem" :key="currentItem.key" class="carousel-line">
                    <template v-if="currentItem.type === 'task'">
                        <span
                            v-if="currentItem.pomodoroCount && currentItem.pomodoroCount > 0"
                            class="pomodoro-pixels shrink-0"
                            :style="{ '--pixel-size': `calc(3px * var(--island-scale, 1))` }"
                        >
                            <i v-for="index in Math.min(currentItem.pomodoroCount, 3)" :key="index" />
                            <span v-if="currentItem.pomodoroCount > 3" class="pomodoro-more">+</span>
                        </span>
                        <span
                            class="truncate flex-1 text-[var(--capsule-text)]"
                            :style="{ fontSize: `calc(12.5px * var(--island-scale, 1))`, fontWeight: 500 }"
                        >{{ currentItem.text }}</span>
                    </template>
                    <template v-else>
                        <span
                            class="truncate text-[var(--capsule-text-dim)]"
                            :style="{ fontSize: `calc(12px * var(--island-scale, 1))` }"
                        >{{ currentItem.text }}</span>
                    </template>
                </div>
            </Transition>
        </div>

        <div class="idle-right">
            <div v-if="props.radioPlaying" class="wave-bars">
                <span class="wave-bar" />
                <span class="wave-bar" />
                <span class="wave-bar" />
            </div>
            <svg
                class="idle-clock"
                :width="clockPixels.width"
                :height="clockPixels.height"
                :viewBox="`0 0 ${clockPixels.width} ${clockPixels.height}`"
                shape-rendering="crispEdges"
                :aria-label="clock"
            >
                <rect
                    v-for="cell in clockPixels.cells"
                    :key="`${cell.x}-${cell.y}`"
                    :x="cell.x"
                    :y="cell.y"
                    :width="pixelUnit"
                    :height="pixelUnit"
                />
            </svg>
        </div>
    </div>
</template>

<style scoped>
.capsule-idle {
    display: flex;
    align-items: center;
    gap: calc(10px * var(--island-scale, 1));
    width: 100%;
    height: 100%;
    padding: 0 calc(14px * var(--island-scale, 1));
    overflow: hidden;
}

.idle-companion {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.companion-pixel {
    display: block;
    image-rendering: pixelated;
}

.alert-pip {
    position: absolute;
    right: -2px;
    top: -1px;
    width: 5px;
    height: 5px;
    background: var(--alert-color);
    animation: alert-blink 1.6s steps(2, end) infinite;
}

.idle-center {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.carousel-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.idle-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: calc(6px * var(--island-scale, 1));
}

.pomodoro-pixels {
    display: inline-flex;
    align-items: center;
    gap: calc(3px * var(--island-scale, 1));
    color: var(--idle-color);
    opacity: 0.78;
}

.pomodoro-pixels i {
    display: block;
    width: var(--pixel-size, calc(3px * var(--island-scale, 1)));
    height: var(--pixel-size, calc(3px * var(--island-scale, 1)));
    background: var(--idle-color);
}

.pomodoro-more {
    font-size: calc(9px * var(--island-scale, 1));
    line-height: 1;
}

.idle-clock {
    display: block;
    flex-shrink: 0;
    image-rendering: pixelated;
}

.idle-clock rect {
    fill: var(--focus-color);
}

.wave-bars {
    display: flex;
    align-items: flex-end;
    gap: calc(3px * var(--island-scale, 1));
    height: calc(12px * var(--island-scale, 1));
}

.wave-bar {
    width: calc(3px * var(--island-scale, 1));
    height: calc(12px * var(--island-scale, 1));
    background: var(--focus-color);
    border-radius: 0;
    opacity: 0.82;
    animation: wave-bounce 1s steps(2, end) infinite;
}

.wave-bar:nth-child(1) {
    animation-delay: 0s;
    clip-path: inset(30% 0 0);
}

.wave-bar:nth-child(2) {
    animation-delay: -0.33s;
    clip-path: inset(0);
}

.wave-bar:nth-child(3) {
    animation-delay: -0.66s;
    clip-path: inset(55% 0 0);
}

@keyframes wave-bounce {
    0%, 100% { clip-path: inset(66% 0 0); }
    50% { clip-path: inset(0); }
}

@keyframes alert-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}

.carousel-enter-active {
    transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1), transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.carousel-leave-active {
    transition: opacity 220ms cubic-bezier(0.4, 0, 0.6, 1), transform 220ms cubic-bezier(0.4, 0, 0.6, 1);
}

.carousel-enter-from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
}

.carousel-leave-to {
    opacity: 0;
    transform: translate3d(0, -6px, 0);
}

@media (prefers-reduced-motion: reduce) {
    .wave-bar,
    .alert-pip {
        animation: none;
    }

    .carousel-enter-active,
    .carousel-leave-active {
        transition: none;
    }
}
</style>
