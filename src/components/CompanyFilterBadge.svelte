<script>
  import { selectedCompany } from '../lib/ghg.js'
</script>

{#if $selectedCompany}
  <span class="company-filter-badge" title="Đổi công ty ở thanh trên cùng">
    Lọc: <strong>{$selectedCompany}</strong>
  </span>
{/if}
