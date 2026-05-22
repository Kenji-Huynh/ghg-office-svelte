<script>
  let {
    onEdit,
    onDelete,
    editTitle = 'Sửa',
    deleteTitle = 'Xóa',
  } = $props()
</script>

<div class="row-action-icons">
  {#if onEdit}
    <button
      type="button"
      class="icon-btn icon-btn--edit"
      title={editTitle}
      aria-label={editTitle}
      onclick={onEdit}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.84-1.83z"
        />
      </svg>
    </button>
  {/if}
  <button
    type="button"
    class="icon-btn icon-btn--danger"
    title={deleteTitle}
    aria-label={deleteTitle}
    onclick={onDelete}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  </button>
</div>
