<script setup lang="ts">
import useVuelidate from '@vuelidate/core';
import { between, helpers, required } from '@vuelidate/validators';
import { Constraints } from '@/data/constraints';

const versionUpdateCheckFrequency = ref<string>('');
const versionUpdateCheckEnabled = ref<boolean>(false);

const { versionUpdateCheckFrequency: existingFrequency } = storeToRefs(
  useFrontendSettingsStore()
);

const maxVersionUpdateCheckFrequency = Constraints.MAX_HOURS_DELAY;
const { t } = useI18n();

const rules = {
  versionUpdateCheckFrequency: {
    required: helpers.withMessage(
      t('general_settings.validation.version_update_check_frequency.non_empty'),
      required
    ),
    between: helpers.withMessage(
      t(
        'general_settings.validation.version_update_check_frequency.invalid_frequency',
        {
          start: 1,
          end: maxVersionUpdateCheckFrequency
        }
      ),
      between(1, Constraints.MAX_HOURS_DELAY)
    )
  }
};

const v$ = useVuelidate(
  rules,
  { versionUpdateCheckFrequency },
  { $autoDirty: true }
);
const { callIfValid } = useValidation(v$);

const resetVersionUpdateCheckFrequency = () => {
  const frequency = get(existingFrequency);
  set(versionUpdateCheckEnabled, frequency > 0);
  set(
    versionUpdateCheckFrequency,
    get(versionUpdateCheckEnabled) ? frequency.toString() : ''
  );
};

const frequencyTransform = (value: string) =>
  value ? Number.parseInt(value) : value;
const switchTransform = (value: boolean) => (value ? 24 : -1);

onMounted(() => {
  resetVersionUpdateCheckFrequency();
});
</script>

<template>
  <VRow>
    <VCol class="grow">
      <SettingsOption
        #default="{ error, success, update }"
        setting="versionUpdateCheckFrequency"
        frontend-setting
        :transform="frequencyTransform"
        :error-message="
          t('general_settings.validation.version_update_check_frequency.error')
        "
        @finished="resetVersionUpdateCheckFrequency()"
      >
        <VTextField
          v-model="versionUpdateCheckFrequency"
          outlined
          :disabled="!versionUpdateCheckEnabled"
          type="number"
          min="1"
          :max="maxVersionUpdateCheckFrequency"
          :label="t('general_settings.labels.version_update_check')"
          persistent-hint
          :hint="t('general_settings.version_update_check_hint')"
          :success-messages="success"
          :error-messages="
            error || v$.versionUpdateCheckFrequency.$errors.map(e => e.$message)
          "
          @change="update($event)"
        />
      </SettingsOption>
    </VCol>
    <VCol class="shrink">
      <SettingsOption
        #default="{ update }"
        setting="versionUpdateCheckFrequency"
        frontend-setting
        :transform="switchTransform"
        @finished="resetVersionUpdateCheckFrequency()"
      >
        <VSwitch
          v-model="versionUpdateCheckEnabled"
          class="mt-3"
          :label="t('general_settings.labels.version_update_check_enabled')"
          @change="callIfValid($event, update)"
        />
      </SettingsOption>
    </VCol>
  </VRow>
</template>
