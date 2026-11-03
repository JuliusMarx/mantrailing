import { Component, computed, input } from '@angular/core';
import { formatDistance, formatDuration, walkingMinutes } from '../../core/geo';
import { TrailPoint } from '../../core/models';
import { waypointInfo } from '../map/waypoint-types';

/** Kennzahlen und Wegpunkt-Liste eines Trails. */
@Component({
  selector: 'app-trail-facts',
  template: `
    <div class="facts">
      <div><strong>{{ lengthText() }}</strong><span>Länge</span></div>
      <div><strong>{{ durationText() }}</strong><span>Gehzeit</span></div>
      @if (difficulty()) {
        <div><strong>{{ difficulty() }}/5</strong><span>Schwierigkeit</span></div>
      }
      @if (surface()) {
        <div><strong>{{ surface() }}</strong><span>Untergrund</span></div>
      }
    </div>
    @if (description()) {
      <p class="description">{{ description() }}</p>
    }
    @if (namedPoints().length) {
      <ul class="points">
        @for (p of namedPoints(); track p.point.id) {
          <li>
            <span class="dot" [style.background]="p.info.color">{{ p.info.glyph }}</span>
            <span>
              <strong>{{ p.info.label }}</strong>
              @if (p.point.note) {
                <br /><span class="muted">{{ p.point.note }}</span>
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      div {
        display: flex;
        flex-direction: column;
      }
      strong {
        font-size: 18px;
      }
      span {
        font-size: 12px;
        color: var(--ion-color-medium);
      }
    }
    .description {
      white-space: pre-line;
    }
    .points {
      list-style: none;
      padding: 0;
      margin: 12px 0 0;
      li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 6px 0;
      }
    }
    .dot {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      color: #fff;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
})
export class TrailFactsComponent {
  readonly length = input(0);
  readonly difficulty = input<number | null>(null);
  readonly surface = input<string | null>(null);
  readonly description = input<string | null>(null);
  readonly waypoints = input<TrailPoint[]>([]);

  protected readonly lengthText = computed(() => formatDistance(this.length()));
  protected readonly durationText = computed(() => formatDuration(walkingMinutes(this.length())));
  protected readonly namedPoints = computed(() =>
    this.waypoints()
      .filter((p) => p.type !== 'via')
      .map((point) => ({ point, info: waypointInfo(point.type) })),
  );
}
