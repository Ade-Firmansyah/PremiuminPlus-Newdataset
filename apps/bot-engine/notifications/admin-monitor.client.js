export function createAdminMonitorClient({ lid = process.env.ADMIN_MONITORING_LID || '64957102211197@lid', sendMessage }) {
  return {
    lid,
    async notify(title, lines = []) {
      if (typeof sendMessage !== 'function') {
        return { status: 'manual_pending', lid };
      }

      const body = [`[${title}]`, '', ...lines].join('\n');
      await sendMessage(lid, body);
      return { status: 'sent', lid };
    },
  };
}
