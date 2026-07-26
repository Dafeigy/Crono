<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../lib/utils";

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: "" });
const attrs = useAttrs();
const classes = computed(() =>
  cn(
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class,
  ),
);
</script>

<template>
  <input v-bind="attrs" v-model="model" :class="classes" />
</template>
