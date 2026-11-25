// What the widget shows for one day. The app works these out ahead of time, because a widget
// can't open the encrypted database.
export type WidgetDay = {
  // Local date, YYYY-MM-DD.
  key: string;
  percent: number;
  done: number;
  total: number;
  streak: number;
  // The next unfinished task, or a count when names are hidden.
  next: string;
};

export type MochiWidgetProps = { days: WidgetDay[]; petName: string; petColor: string };

export type MochiWidgetHandle = {
  updateSnapshot: (props: MochiWidgetProps) => void;
  updateTimeline: (entries: { date: Date; props: MochiWidgetProps }[]) => void;
};
