import { Module } from '@nestjs/common';
import { VideoController } from './video/video.controller';
import { VideoService } from './video/video.service';

@Module({
  imports: [],
  controllers: [VideoController],
  providers: [VideoService],
})
export class AppModule {}
