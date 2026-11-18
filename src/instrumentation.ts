export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCustomerJobs } = await import('./lib/customer-settings');
    startCustomerJobs();
  }
}
