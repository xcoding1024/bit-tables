<script setup lang="ts">
defineProps<{
  src: string;
  alt: string;
  caption?: string;
}>();
</script>

<template>
  <figure class="demo-figure">
    <div class="demo-figure__media">
      <img :src="src" :alt="alt" loading="lazy" />
    </div>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>
