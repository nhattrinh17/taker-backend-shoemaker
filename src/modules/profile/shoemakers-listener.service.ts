import { TIME_DELAY_CHANGE_STATUS_ONLINE } from '@common/constants';
import RedisService from '@common/services/redis.service';
import { SocketService } from '@modules/socket/socket.service';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ShoemakersListenerService implements OnModuleInit {
  private readonly logger = new Logger(ShoemakersListenerService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly socketService: SocketService,
  ) {}

  isUUID(message: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(message);
  }

  async onModuleInit() {
    console.log('ShoemakersListenerService initialized');
    const redisClient = this.redis.getClient();
    await redisClient.subscribe('__keyevent@0__:expired');

    redisClient.on('message', async (channel, message) => {
      this.logger.log(`Received message: ${message} from channel: ${channel}`);
      if (channel === '__keyevent@0__:expired') {
        if (this.isUUID(message)) {
          this.logger.log('Redis event with id: ' + message + ' is offline');
          const socketShoemakerId = await this.socketService.getSocketIdByUserId(message);
          if (!socketShoemakerId) {
            console.log('Update isOnline to false for shoemakers ', message);
            this.eventEmitter.emit('shoemaker-update-status', {
              isOnline: false,
              userId: message,
            });
          } else {
            console.log('Add setExpire for shoemakers ', message);
            this.redis.setExpire(message, 'online', TIME_DELAY_CHANGE_STATUS_ONLINE);
          }
        }
      }
    });
  }
}
