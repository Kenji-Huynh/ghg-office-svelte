<script>
  import { COMPANIES, ALL_COMPANIES } from '../lib/companies.js'

  let {
    value = $bindable(''),
    showAll = false,
    required = false,
    label = 'Công ty',
    hideLabel = false,
    id = 'company-select',
    compact = false,
    title = '',
  } = $props()
</script>

<div class="company-select-wrap" class:company-select-wrap--compact={compact}>
  {#if label && !hideLabel}
    <label class="company-select-label" for={id}>
      {label}
      {#if required}<span class="required">*</span>{/if}
    </label>
  {/if}
  <select
    {id}
    {title}
    class="company-select"
    class:company-select--compact={compact}
    bind:value
    {required}
    aria-label={hideLabel ? 'Chọn công ty' : label || 'Chọn công ty'}
  >
    {#if showAll}
      <option value={ALL_COMPANIES}>Tất cả công ty</option>
    {:else if !required}
      <option value="">-- Chọn công ty --</option>
    {/if}
    {#each COMPANIES as co}
      <option value={co}>{co}</option>
    {/each}
  </select>
</div>
