import { Gauge, HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { MochiWidgetProps } from './types';

// Runs on its own outside the app: no hooks, imports or anything declared outside the function.
const MochiWidget = (props: MochiWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1C1C24' : '#FFFFFF';
  const ink = dark ? '#EDEDF0' : '#16161C';
  const muted = dark ? '#A0A0AC' : '#62626E';
  const accent = dark ? '#5DCAA5' : '#128A6B';
  const flame = dark ? '#EF9F27' : '#B96A00';
  const now = environment.date ? new Date(environment.date) : new Date();
  const two = (n: number) => `${n < 10 ? '0' : ''}${n}`;
  const key = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const day = (props.days ?? []).find((d) => d.key === key);
  const petColor = props.petColor || '#5DCAA5';
  const face = !day || day.total === 0 ? '- ‿ -' : day.percent >= 100 ? '^ ‿ ^' : '• ‿ •';
  const family = environment.widgetFamily;
  const headline = !day
    ? props.petName || 'Mochi'
    : day.total === 0
      ? 'Free day'
      : `${day.percent}%`;
  const streak = !day
    ? 'Tap to open'
    : day.streak > 0
      ? `${day.streak}-day streak`
      : 'Start a streak today';
  const next = !day ? 'Tap to see today’s tasks' : day.next;
  const value = day ? day.percent / 100 : 0;

  if (family === 'accessoryInline') {
    return <Text modifiers={[widgetURL('mochi://')]}>{`${headline} · ${streak}`}</Text>;
  }
  if (family === 'accessoryCircular') {
    return (
      <Gauge
        value={value}
        currentValueLabel={<Text>{day ? `${day.percent}` : '–'}</Text>}
        modifiers={[
          gaugeStyle('circularCapacity'),
          containerBackground('#00000000', 'widget'),
          widgetURL('mochi://'),
        ]}
      />
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack
        alignment="leading"
        modifiers={[containerBackground('#00000000', 'widget'), widgetURL('mochi://')]}
      >
        <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>
          {`${headline} · ${streak}`}
        </Text>
        <ProgressView value={value} />
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{next}</Text>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'leading' }),
        containerBackground(bg, 'widget'),
        widgetURL('mochi://'),
      ]}
    >
      <HStack spacing={10}>
        <Text
          modifiers={[
            font({ size: 14, weight: 'bold' }),
            foregroundStyle('#16161C'),
            frame({ width: 52, height: 46 }),
            background(petColor),
            cornerRadius(20),
          ]}
        >
          {face}
        </Text>
        <Text
          modifiers={[
            font({ size: 24, weight: 'bold', design: 'rounded' }),
            foregroundStyle(ink),
            lineLimit(1),
          ]}
        >
          {headline}
        </Text>
        <Spacer />
      </HStack>
      <Text
        modifiers={[
          font({ size: 13 }),
          foregroundStyle(day && day.streak > 0 ? flame : muted),
          lineLimit(1),
        ]}
      >
        {streak}
      </Text>
      <ProgressView value={value} modifiers={[tint(accent)]} />
      <Text
        modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}
      >
        {next}
      </Text>
    </VStack>
  );
};

export default createWidget('MochiWidget', MochiWidget, {
  days: [],
  petName: 'Mochi',
  petColor: '#5DCAA5',
});
