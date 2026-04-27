// Notification service for push alerts on critical incidents
// Uses Web Notifications API (no backend required)

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('Notification permission request failed:', e);
    return false;
  }
}

export function sendTestNotification() {
  if (Notification.permission !== 'granted') {
    alert('Please allow notifications first');
    requestNotificationPermission();
    return;
  }

  new Notification('🔔 CrisisHub AI: Test Alert', {
    body: 'Success! Your browser is configured to receive critical incident updates.',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: 'test-notification',
  });
}

export function sendCriticalAlert(incident) {
  if (Notification.permission !== 'granted') {
    return;
  }

  const severity = incident.classification?.severity || '';
  if (severity !== 'critical') {
    return;
  }

  try {
    new Notification(
      `🚨 ${incident.classification?.incident_type?.toUpperCase() || 'EMERGENCY'} ALERT`,
      {
        body: `${incident.classification?.summary || 'Critical incident detected'} in ${incident.classification?.location || 'the venue'}`,
        icon: '/logo.png',
        badge: '/logo.png',
        tag: incident.id,
        requireInteraction: true,
        silent: false,
      }
    );
  } catch (e) {
    console.error('Failed to send notification:', e);
  }
}

export function sendIncidentUpdate(incident, message) {
  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    new Notification('Incident Update', {
      body: message,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: `update-${incident.id}`,
      silent: false,
    });
  } catch (e) {
    console.error('Failed to send update notification:', e);
  }
}
