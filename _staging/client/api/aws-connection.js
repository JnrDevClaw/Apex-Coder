/**
 * AWS Connection Handler - Vercel Serverless Function
 * Handles AWS credential validation and basic operations
 */

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { S3Client, CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method, body } = req;

  try {
    if (method === 'POST' && req.url.includes('validate')) {
      // Validate AWS credentials
      const { accessKeyId, secretAccessKey, region = 'us-east-1' } = body;

      if (!accessKeyId || !secretAccessKey) {
        return res.status(400).json({ 
          error: 'Missing credentials',
          message: 'AWS Access Key ID and Secret Access Key are required'
        });
      }

      try {
        // Create STS client to validate credentials
        const stsClient = new STSClient({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey
          }
        });

        // Get caller identity to validate credentials
        const command = new GetCallerIdentityCommand({});
        const identity = await stsClient.send(command);

        res.status(200).json({
          success: true,
          account: {
            accountId: identity.Account,
            userId: identity.UserId,
            arn: identity.Arn,
            region: region
          }
        });
        return;
      } catch (awsError) {
        return res.status(401).json({
          error: 'Invalid AWS credentials',
          message: awsError.message
        });
      }
    }

    if (method === 'POST' && req.url.includes('create-bucket')) {
      // Create S3 bucket for app deployment
      const { bucketName, accessKeyId, secretAccessKey, region = 'us-east-1' } = body;

      if (!bucketName || !accessKeyId || !secretAccessKey) {
        return res.status(400).json({ 
          error: 'Missing parameters',
          message: 'Bucket name and AWS credentials are required'
        });
      }

      try {
        const s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey
          }
        });

        // Create bucket
        const createCommand = new CreateBucketCommand({
          Bucket: bucketName,
          CreateBucketConfiguration: region !== 'us-east-1' ? {
            LocationConstraint: region
          } : undefined
        });

        await s3Client.send(createCommand);

        res.status(201).json({
          success: true,
          bucket: {
            name: bucketName,
            region: region,
            url: `https://${bucketName}.s3.${region}.amazonaws.com`
          }
        });
        return;
      } catch (awsError) {
        return res.status(400).json({
          error: 'Failed to create bucket',
          message: awsError.message
        });
      }
    }

    if (method === 'GET' && req.url.includes('list-buckets')) {
      // List S3 buckets
      const { accessKeyId, secretAccessKey, region = 'us-east-1' } = req.query;

      if (!accessKeyId || !secretAccessKey) {
        return res.status(400).json({ 
          error: 'Missing credentials'
        });
      }

      try {
        const s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey
          }
        });

        const command = new ListBucketsCommand({});
        const response = await s3Client.send(command);

        res.status(200).json({
          success: true,
          buckets: response.Buckets.map(bucket => ({
            name: bucket.Name,
            creationDate: bucket.CreationDate
          }))
        });
        return;
      } catch (awsError) {
        return res.status(400).json({
          error: 'Failed to list buckets',
          message: awsError.message
        });
      }
    }

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('AWS connection error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}