import { IsNotEmpty, IsNumber, IsString, IsUrl, Min } from 'class-validator';

export class UploadVideoDto {
  @IsUrl()
  @IsNotEmpty()
  audioUrl: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsNumber()
  @Min(0)
  audioStartTime: number; // Start time in seconds (e.g., 5.5)

  @IsNumber()
  @Min(0)
  audioEndTime: number; // End time in seconds (e.g., 25)
}
