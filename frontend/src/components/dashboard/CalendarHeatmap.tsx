import { useMemo } from 'react';
import type { SessionListItem } from '../../types/api';
import { stateColors } from '../../utils/stateColors';
import { LearnerState } from '../../types/states';

interface CalendarHeatmapProps {
  sessions: SessionListItem[];
}

export function CalendarHeatmap({ sessions }: CalendarHeatmapProps) {
  const { weeks, monthLabels } = useMemo(() => {
    const now = new Date();
    const weeks: Array<Array<{ date: Date; minutes: number; state: LearnerState | null; intensity: number }>> = [];
    const monthLabels: string[] = [];
    
    // Get last 12 weeks
    const weekCount = 12;
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Start from today, go back 12 weeks
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (weekCount * 7));
    
    // Group sessions by date
    const sessionsByDate = new Map<string, { minutes: number; count: number }>();
    sessions.forEach((session) => {
      const date = new Date(session.started_at);
      const dateStr = date.toISOString().split('T')[0];
      const existing = sessionsByDate.get(dateStr) || { minutes: 0, count: 0 };
      existing.minutes += session.duration_seconds / 60;
      existing.count += 1;
      sessionsByDate.set(dateStr, existing);
    });
    
    // Build weeks
    let currentDate = new Date(startDate);
    let lastMonth = -1;
    
    for (let week = 0; week < weekCount; week++) {
      const weekData: Array<{ date: Date; minutes: number; state: LearnerState | null; intensity: number }> = [];
      
      for (let day = 0; day < 7; day++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const sessionData = sessionsByDate.get(dateStr);
        
        let dominantState: LearnerState | null = null;
        let intensity = 0;
        
        if (sessionData) {
          // Since sessions don't have dominant_state, use FLOW as default
          // In a real app, you'd fetch session details to get actual state
          dominantState = 'FLOW';
          
          // Intensity based on minutes (0-1 scale, max 120 min = 1.0)
          intensity = Math.min(sessionData.minutes / 120, 1);
        }
        
        weekData.push({
          date: new Date(currentDate),
          minutes: sessionData?.minutes || 0,
          state: dominantState,
          intensity,
        });
        
        // Track month labels
        const month = currentDate.getMonth();
        if (month !== lastMonth && day === 0) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          monthLabels.push(monthNames[month]);
          lastMonth = month;
        } else if (week === 0 && day === 0) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          monthLabels.push(monthNames[month]);
          lastMonth = month;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      weeks.push(weekData);
    }
    
    return { weeks, monthLabels };
  }, [sessions]);

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const cellSize = 12;
  const cellGap = 3;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-textMuted">
          Activity Calendar
        </div>
        <div className="mt-1 font-serifDisplay text-lg italic text-textPrimary">
          Your learning rhythm
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="flex gap-2">
          {/* Day labels */}
          <div className="flex flex-col gap-1 pt-5">
            {dayLabels.map((label, i) => (
              <div
                key={i}
                className="text-[10px] text-textFaint"
                style={{ height: cellSize + cellGap }}
              >
                {i % 2 === 1 ? label : ''}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="flex-1">
            {/* Month labels */}
            <div className="mb-1 flex gap-1">
              {monthLabels.map((month, i) => (
                <div
                  key={i}
                  className="text-[10px] text-textFaint"
                  style={{ width: (cellSize + cellGap) * 7 }}
                >
                  {month}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="flex gap-1">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {week.map((day, dayIdx) => {
                    const color = day.state
                      ? stateColors[day.state]
                      : 'transparent';
                    const opacity = day.state ? 0.3 + day.intensity * 0.7 : 0.1;
                    
                    return (
                      <div
                        key={dayIdx}
                        className="rounded-sm border border-borderSubtle transition-all hover:scale-110 hover:border-accentViolet/40"
                        style={{
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: day.state ? color : 'transparent',
                          opacity,
                          borderColor: day.state ? color : '#26263A',
                        }}
                        title={`${day.date.toLocaleDateString()}: ${day.minutes > 0 ? `${day.minutes} min, ${day.state}` : 'No session'}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
