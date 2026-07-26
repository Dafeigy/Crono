<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../lib/utils";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    tone?: "neutral" | "success" | "warning" | "danger" | "info";
  }>(),
  { tone: "neutral" },
);

const attrs = useAttrs();
const toneClass = computed(
  () =>
    ({
      neutral: "bg-muted text-muted-foreground",
      success:
        "bg-[color-mix(in_oklch,var(--crono-success)_16%,transparent)] text-[var(--crono-success)]",
      warning:
        "bg-[color-mix(in_oklch,var(--crono-warning)_16%,transparent)] text-[var(--crono-warning)]",
      danger:
        "bg-[color-mix(in_oklch,var(--crono-danger)_16%,transparent)] text-[var(--crono-danger)]",
      info: "bg-[color-mix(in_oklch,var(--crono-info)_16%,transparent)] text-[var(--crono-info)]",
    })[props.tone],
);
</script>

<template>
  <span
    v-bind="attrs"
    :class="
      cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold',
        toneClass,
        attrs.class,
      )
    "
  >
    <slot />
  </span>
</template>

