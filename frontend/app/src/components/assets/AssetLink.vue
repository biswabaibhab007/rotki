<script setup lang="ts">
import { Routes } from '@/router/routes';
import { getAddressFromEvmIdentifier } from '@/utils/assets';

const props = withDefaults(
  defineProps<{
    asset: string;
    icon?: boolean;
    text?: boolean;
    link?: boolean;
  }>(),
  {
    icon: false,
    text: false,
    link: false
  }
);

const { asset } = toRefs(props);

const router = useRouter();

const address = reactify(getAddressFromEvmIdentifier)(asset);
const { assetInfo } = useAssetInfoRetrieval();
const assetDetails = assetInfo(asset);

const navigateToDetails = async () => {
  await router.push({
    path: Routes.ASSETS.replace(':identifier', encodeURIComponent(get(asset)))
  });
};
</script>

<template>
  <div class="flex flex-row">
    <VBtn :icon="icon" :text="text" @click="navigateToDetails()">
      <slot />
    </VBtn>
    <HashLink
      v-if="address && link"
      link-only
      type="address"
      :text="address"
      :evm-chain="assetDetails?.evmChain"
    />
  </div>
</template>
