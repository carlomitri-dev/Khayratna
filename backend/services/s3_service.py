"""
AWS S3 Service for KAIROS
Handles file uploads, downloads, and deletions for inventory images, logos, and documents
"""
import boto3
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Optional, Dict, Any
import os
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

class S3Service:
    def __init__(self):
        """Initialize S3 client with lazy loading to ensure environment variables are loaded"""
        self._s3_client = None
        self._initialized = False
        self.expiration = 3600  # 1 hour default expiration for presigned URLs
    
    @property
    def aws_access_key(self):
        return os.environ.get('AWS_ACCESS_KEY_ID')
    
    @property
    def aws_secret_key(self):
        return os.environ.get('AWS_SECRET_ACCESS_KEY')
    
    @property
    def region(self):
        return os.environ.get('AWS_REGION', 'eu-north-1')
    
    @property
    def bucket_name(self):
        return os.environ.get('S3_BUCKET_NAME', 'smartbook-lms-files')
    
    @property
    def s3_client(self):
        """Lazy initialization of S3 client"""
        if not self._initialized:
            self._initialize_client()
        return self._s3_client
    
    def _initialize_client(self):
        """Initialize S3 client if credentials are available"""
        self._initialized = True
        if self.aws_access_key and self.aws_secret_key:
            try:
                self._s3_client = boto3.client(
                    's3',
                    region_name=self.region,
                    aws_access_key_id=self.aws_access_key,
                    aws_secret_access_key=self.aws_secret_key
                )
                logger.info(f"S3 client initialized for bucket: {self.bucket_name}")
            except Exception as e:
                logger.error(f"Failed to initialize S3 client: {str(e)}")
                self._s3_client = None
        else:
            logger.warning("AWS credentials not found. S3 uploads will be disabled.")
    
    def is_configured(self) -> bool:
        """Check if S3 is properly configured"""
        return self.s3_client is not None
    
    def generate_file_key(self, organization_id: str, file_type: str, original_filename: str) -> str:
        """
        Generate a unique S3 key for a file
        
        Format: kairos/{org_id}/{file_type}/{uuid}_{original_filename}
        """
        file_extension = original_filename.split('.')[-1].lower() if '.' in original_filename else ''
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = original_filename.replace(' ', '_')[:50]  # Limit filename length
        
        return f"kairos/{organization_id}/{file_type}/{unique_id}_{safe_filename}"
    
    def generate_presigned_upload_url(
        self,
        file_key: str,
        content_type: str,
        expiration: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a presigned URL for uploading files directly to S3
        
        Args:
            file_key: The S3 object key (path/filename)
            content_type: MIME type of the file
            expiration: URL expiration time in seconds
            
        Returns:
            Dictionary containing presigned URL and metadata, or None on error
        """
        if not self.is_configured():
            logger.error("S3 client not configured")
            return None
            
        try:
            expiration = expiration or self.expiration
            
            presigned_url = self.s3_client.generate_presigned_url(
                ClientMethod='put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key,
                    'ContentType': content_type
                },
                ExpiresIn=expiration
            )
            
            logger.info(f"Generated presigned upload URL for key: {file_key}")
            return {
                'upload_url': presigned_url,
                'file_key': file_key,
                'expiration': expiration,
                'bucket': self.bucket_name
            }
            
        except ClientError as e:
            logger.error(f"Error generating presigned upload URL: {str(e)}")
            return None
        except NoCredentialsError:
            logger.error("AWS credentials not available")
            return None
    
    def generate_presigned_download_url(
        self,
        file_key: str,
        expiration: Optional[int] = None
    ) -> Optional[str]:
        """
        Generate a presigned URL for downloading files from S3
        
        Args:
            file_key: The S3 object key
            expiration: URL expiration time in seconds
            
        Returns:
            Presigned URL string or None on error
        """
        if not self.is_configured():
            logger.error("S3 client not configured")
            return None
            
        try:
            expiration = expiration or self.expiration
            
            presigned_url = self.s3_client.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': file_key
                },
                ExpiresIn=expiration
            )
            
            logger.info(f"Generated presigned download URL for key: {file_key}")
            return presigned_url
            
        except ClientError as e:
            logger.error(f"Error generating presigned download URL: {str(e)}")
            return None
    
    def get_public_url(self, file_key: str) -> str:
        """
        Get the public URL for an S3 object (if bucket allows public access)
        
        Args:
            file_key: The S3 object key
            
        Returns:
            Public URL string
        """
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{file_key}"
    
    async def upload_file(
        self,
        file_content: bytes,
        file_key: str,
        content_type: str = 'application/octet-stream'
    ) -> Optional[Dict[str, Any]]:
        """
        Upload a file directly to S3 from the backend
        
        Args:
            file_content: File bytes to upload
            file_key: S3 object key
            content_type: MIME type of the file
            
        Returns:
            Dictionary with upload result or None on error
        """
        if not self.is_configured():
            logger.error("S3 client not configured")
            return None
            
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=file_key,
                Body=file_content,
                ContentType=content_type
            )
            
            logger.info(f"Successfully uploaded file to {file_key}")
            
            return {
                'file_key': file_key,
                'bucket': self.bucket_name,
                'url': self.get_public_url(file_key),
                'content_type': content_type,
                'size': len(file_content)
            }
            
        except ClientError as e:
            logger.error(f"Error uploading file to {file_key}: {str(e)}")
            return None
    
    def delete_object(self, file_key: str) -> bool:
        """
        Delete an object from S3 bucket
        
        Args:
            file_key: The S3 object key to delete
            
        Returns:
            True if deletion successful, False otherwise
        """
        if not self.is_configured():
            logger.error("S3 client not configured")
            return False
            
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            logger.info(f"Successfully deleted object: {file_key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error deleting object {file_key}: {str(e)}")
            return False
    
    def get_object_metadata(self, file_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve metadata about an S3 object
        
        Args:
            file_key: The S3 object key
            
        Returns:
            Dictionary with object metadata or None on error
        """
        if not self.is_configured():
            return None
            
        try:
            response = self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            return {
                'size': response['ContentLength'],
                'last_modified': response['LastModified'].isoformat(),
                'content_type': response.get('ContentType', 'unknown'),
                'etag': response['ETag']
            }
        except ClientError as e:
            logger.error(f"Error retrieving metadata for {file_key}: {str(e)}")
            return None
    
    def list_objects(self, prefix: str, max_keys: int = 100) -> list:
        """
        List objects in S3 bucket with a specific prefix
        
        Args:
            prefix: S3 key prefix to filter objects
            max_keys: Maximum number of keys to return
            
        Returns:
            List of object keys
        """
        if not self.is_configured():
            return []
            
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                MaxKeys=max_keys
            )
            
            objects = []
            for obj in response.get('Contents', []):
                objects.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat()
                })
            
            return objects
            
        except ClientError as e:
            logger.error(f"Error listing objects with prefix {prefix}: {str(e)}")
            return []


# Create singleton instance
s3_service = S3Service()
