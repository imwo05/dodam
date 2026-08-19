export function getHealth() {
  return {
    data: {
      status: 'ok',
      service: 'localive-backend',
      uptimeSeconds: Math.floor(process.uptime())
    }
  };
}
