export interface TrackedPointer {
  pointerId: number;
  type: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  startX: number;
  startY: number;
  pressure: number;
  startTime: number;
  time: number;
}

export class PointerTracker {
  private readonly pointers = new Map<number, TrackedPointer>();

  begin(event: PointerEvent): TrackedPointer {
    const pointer: TrackedPointer = {
      pointerId: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      prevX: event.clientX,
      prevY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pressure: event.pressure,
      startTime: event.timeStamp,
      time: event.timeStamp,
    };
    this.pointers.set(event.pointerId, pointer);
    return pointer;
  }

  move(event: PointerEvent): TrackedPointer | undefined {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      return undefined;
    }
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.pressure = event.pressure;
    pointer.time = event.timeStamp;
    return pointer;
  }

  end(pointerId: number): TrackedPointer | undefined {
    const pointer = this.pointers.get(pointerId);
    this.pointers.delete(pointerId);
    return pointer;
  }

  cancel(pointerId: number): TrackedPointer | undefined {
    return this.end(pointerId);
  }

  all(): TrackedPointer[] {
    return [...this.pointers.values()];
  }

  count(): number {
    return this.pointers.size;
  }
}
