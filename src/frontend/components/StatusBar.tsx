import { useEffect, useState } from 'react';

const asset = (name: string) => `/assets/${name}`;

function currentTime() {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function CellularIcon() {
  return (
    <span className="status-cellular" aria-hidden="true">
      <img src={asset('status-cellular-1.svg')} alt="" />
      <img src={asset('status-cellular-2.svg')} alt="" />
      <img src={asset('status-cellular-3.svg')} alt="" />
      <img src={asset('status-cellular-4.svg')} alt="" />
    </span>
  );
}

export function StatusBar({ offset = 0 }: { offset?: number }) {
  const [time, setTime] = useState(currentTime);

  useEffect(() => {
    const timer = window.setInterval(() => setTime(currentTime()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`status-bar ${offset ? 'status-bar--offset' : ''}`} style={offset ? { transform: `translateY(${offset}px)` } : undefined} data-node-id="291:3966" aria-label={`현재 시각 ${time}`}>
      <div className="status-bar__area status-bar__area--left"><span className="status-time">{time}</span></div>
      <span className="status-island" aria-hidden="true" />
      <div className="status-bar__area status-bar__area--right" aria-hidden="true">
        <CellularIcon />
        <img className="status-wifi" src={asset('status-wifi.svg')} alt="" />
        <img className="status-battery" src={asset('status-battery.svg')} alt="" />
      </div>
    </div>
  );
}
