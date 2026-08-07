document.addEventListener("DOMContentLoaded", () => {
  const data = PartnersStore.getData();
  const top = document.querySelector("[data-top-creators]");

  if (top) {
    top.innerHTML = [...data.creators]
      .sort((a, b) => b.confirmed - a.confirmed)
      .slice(0, 4)
      .map(
        (creator) => `
          <tr>
            <td class="cell-creator">
              <strong class="creator-nowrap">${dasEscapeHtml(creator.name)}</strong>
            </td>
            <td class="cell-code">${dasEscapeHtml(creator.code)}</td>
            <td>${dasEscapeHtml(creator.confirmed)}</td>
            <td class="cell-status">${badge(creator.status)}</td>
          </tr>
        `,
      )
      .join("");
  }

  const activity = document.querySelector("[data-recent-activity]");
  if (activity) {
    activity.innerHTML = data.activity
      .slice(0, 5)
      .map(
        (item) => `
          <tr>
            <td>
              <strong>${dasEscapeHtml(item.date)}</strong><br />
              <span class="small-muted">${dasEscapeHtml(item.time)}</span>
            </td>
            <td>
              ${dasEscapeHtml(item.event)}<br />
              <span class="small-muted creator-nowrap">${dasEscapeHtml(PartnersStore.creatorName(item.creatorId))}</span>
            </td>
            <td class="cell-code">${dasEscapeHtml(item.admin)}</td>
          </tr>
        `,
      )
      .join("");
  }
});
