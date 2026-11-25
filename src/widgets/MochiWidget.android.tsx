import { Box, Column, LinearProgressIndicator, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
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
  const track = dark ? '#33333D' : '#E3E3E9';
  const flame = dark ? '#EF9F27' : '#B96A00';
  const now = new Date();
  const two = (n: number) => `${n < 10 ? '0' : ''}${n}`;
  const key = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const day = (props.days ?? []).find((d) => d.key === key);
  const petColor = props.petColor || '#5DCAA5';
  const face = !day || day.total === 0 ? '- ‿ -' : day.percent >= 100 ? '^ ‿ ^' : '• ‿ •';

  return (
    <Column
      modifiers={[fillMaxSize(), background(bg), cornerRadius(20), paddingAll(14)]}
      verticalArrangement="center"
    >
      <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
        <Box
          modifiers={[size(52, 46), background(petColor), cornerRadius(20)]}
          contentAlignment="center"
        >
          <Text color="#16161C" style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
            {face}
          </Text>
        </Box>
        <Spacer modifiers={[width(12)]} />
        <Column modifiers={[fillMaxWidth()]}>
          <Text color={ink} style={{ fontSize: 22, fontWeight: 'bold' }} maxLines={1}>
            {!day ? props.petName || 'Mochi' : day.total === 0 ? 'Free day' : `${day.percent}%`}
          </Text>
          <Text color={day && day.streak > 0 ? flame : muted} style={{ fontSize: 13 }} maxLines={1}>
            {!day ? 'Tap to open' : day.streak > 0 ? `${day.streak}-day streak` : 'Start a streak today'}
          </Text>
        </Column>
      </Row>
      <Spacer modifiers={[height(10)]} />
      <LinearProgressIndicator
        progress={day ? day.percent / 100 : 0}
        color={accent}
        trackColor={track}
        modifiers={[fillMaxWidth(), height(6)]}
      />
      <Text
        color={muted}
        style={{ fontSize: 13 }}
        maxLines={1}
        modifiers={[fillMaxWidth(), padding(0, 8, 0, 0)]}
      >
        {!day ? 'Tap to see today’s tasks' : day.next}
      </Text>
    </Column>
  );
};

export default createWidget('MochiWidget', MochiWidget, {
  days: [],
  petName: 'Mochi',
  petColor: '#5DCAA5',
});
