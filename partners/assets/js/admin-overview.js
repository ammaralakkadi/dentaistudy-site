document.addEventListener("DOMContentLoaded", async () => {
  const auth = window.DentAIStudyPartnerSupabase;
  const activityBody = document.querySelector("[data-recent-activity]");

  if (!auth?.enabled || !activityBody) return;

  const authState = await window.DentAIStudyPartnerAuthReady;
  if (!authState?.user) return;

  const eventTitle = (eventType) => auth.activityEventTitle(eventType);


  try {
    const [activityResult, creatorsResult] = await Promise.all([
      auth.client
        .from("partner_activity")
        .select(
          "id,creator_id,actor_kind,event_type,details,metadata,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(5),
      auth.client
        .from("partner_creators")
        .select("id,name,promo_code"),
    ]);

    const error = activityResult.error || creatorsResult.error;
    if (error) throw error;

    const creators = new Map(
      (creatorsResult.data || []).map((creator) => [creator.id, creator]),
    );
    const activity = activityResult.data || [];

    if (!activity.length) {
      activityBody.innerHTML =
        '<tr><td class="referral-empty" colspan="3">No Partner activity yet.</td></tr>';
      return;
    }

    activityBody.innerHTML = activity
      .map((item) => {
        const creator = item.creator_id ? creators.get(item.creator_id) : null;
        const subject = creator
          ? `${creator.name} · ${creator.promo_code}`
          : "Partner program";
        const detail = String(item.details || "").trim();

        return `
          <tr>
            <td class="cell-nowrap"><strong>${dasEscapeHtml(auth.dateLabel(item.created_at))}</strong></td>
            <td>
              <strong>${dasEscapeHtml(eventTitle(item.event_type))}</strong>
              <span class="small-muted creator-nowrap">${dasEscapeHtml(detail || subject)}</span>
            </td>
            <td class="cell-status">${badge(auth.titleCase(item.actor_kind))}</td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
    activityBody.innerHTML =
      '<tr><td class="referral-empty" colspan="3">Recent activity could not be loaded.</td></tr>';
  }
});
