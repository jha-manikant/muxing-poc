import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';

ffmpeg.setFfmpegPath(ffmpegPath!);
ffmpeg.setFfprobePath(ffprobePath.path);

@Injectable()
export class VideoService {
  private readonly uploadDir = path.resolve('./uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // Helper function to get video duration using ffprobe.
  private getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          return reject(new Error('Error getting video duration.'));
        }
        const duration = metadata.format.duration;
        if (!duration) {
          return reject(new Error('Could not determine video duration.'));
        }
        resolve(duration);
      });
    });
  }

  async mergeVideoAndAudio(
    videoPath: string,
    audioUrl: string,
    outputName: string,
    audioStartTime: number,
    audioEndTime: number,
  ): Promise<string> {
    const videoFullPath = path.resolve(videoPath);
    const tempAudioId = `${Date.now()}-audio`;
    const videoId = `${Date.now()}-video`;
    const audioPath = path.join(this.uploadDir, `${tempAudioId}-audio.mp3`);
    const outputFullPath = path.join(
      this.uploadDir,
      `${outputName + '-' + videoId}.mp4`,
    );

    try {
      // 1. Get video duration and validate audio crop times.
      const videoDuration = await this.getVideoDuration(videoFullPath);
      const audioCropDuration = audioEndTime - audioStartTime;

      if (audioCropDuration <= 0) {
        throw new BadRequestException(
          'Audio end time must be after start time.',
        );
      }

      if (audioCropDuration > videoDuration) {
        throw new BadRequestException(
          `The selected audio duration (${audioCropDuration.toFixed(2)}s) cannot be longer than the video duration (${videoDuration.toFixed(2)}s).`,
        );
      }

      // Download the audio.
      // console.log('Downloading audio from:', audioUrl);
      const response = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(audioPath, Buffer.from(response.data));
      // console.log('Audio downloaded. Size:', fs.statSync(audioPath).size);

      // 3. Crop and convert audio in one FFmpeg command.
      const croppedAudioPath = path.join(
        this.uploadDir,
        `${tempAudioId}-cropped.mp3`,
      );

      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(audioStartTime) // Set start time for cropping
          .setDuration(audioCropDuration) // Set duration for cropping
          .toFormat('mp3')
          .on('start', (cmd) => console.log('Cropping audio command:', cmd))
          .on('error', (err) => {
            console.error('Audio cropping error:', err);
            reject(err);
          })
          .on('end', () => {
            console.log('Audio cropping finished');
            resolve();
          })
          .save(croppedAudioPath);
      });

      // 4. Merge video and the new cropped audio.
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .addInput(videoFullPath)
          .addInput(croppedAudioPath)
          .outputOptions([
            '-map 0:v:0',
            '-map 1:a:0',
            '-c:v copy',
            '-c:a aac',
            '-shortest', // Ensure output duration doesn't exceed the shortest input.
          ])
          .on('start', (cmd) => console.log('FFmpeg merge command:', cmd))
          .on('error', (err, stdout, stderr) => {
            console.error('FFmpeg merge error:', err.message);
            console.error('FFmpeg stderr:', stderr);
            reject(err);
          })
          .on('end', () => {
            console.log('Merging completed');
            resolve();
          })
          .save(outputFullPath);
      });

      // 5. Cleanup temporary audio files
      fs.unlinkSync(audioPath);
      fs.unlinkSync(croppedAudioPath);

      return outputFullPath;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error in video processing pipeline:', error);
      throw new InternalServerErrorException('Failed to process video');
    }
  }
}
