#!/bin/bash

# Infrastructure Test Runner Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if we're in the infra directory
if [ ! -f "package.json" ]; then
    error "Please run this script from the infra directory"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log "Installing test dependencies..."
    npm install
fi

# Check for required tools
check_tools() {
    log "Checking required tools..."
    
    local missing_tools=()
    
    if ! command -v terraform &> /dev/null; then
        missing_tools+=("terraform")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws")
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        warn "Missing tools: ${missing_tools[*]}"
        warn "Some tests may be skipped"
    else
        log "All required tools are available"
    fi
}

# Run specific test suites
run_infrastructure_tests() {
    log "Running infrastructure provisioning tests..."
    npm run test:infrastructure
}

run_deployment_tests() {
    log "Running deployment tests..."
    npm run test:deployment
}

run_backup_tests() {
    log "Running backup and recovery tests..."
    npm run test:backup
}

run_monitoring_tests() {
    log "Running monitoring tests..."
    npm run test:monitoring
}

run_integration_tests() {
    log "Running integration tests..."
    npm test test/integration.test.js
}

# Main function
main() {
    log "Starting infrastructure tests..."
    
    check_tools
    
    case "${1:-all}" in
        "infrastructure")
            run_infrastructure_tests
            ;;
        "deployment")
            run_deployment_tests
            ;;
        "backup")
            run_backup_tests
            ;;
        "monitoring")
            run_monitoring_tests
            ;;
        "integration")
            run_integration_tests
            ;;
        "all")
            run_infrastructure_tests
            run_deployment_tests
            run_backup_tests
            run_monitoring_tests
            run_integration_tests
            ;;
        *)
            echo "Usage: $0 {infrastructure|deployment|backup|monitoring|integration|all}"
            echo "  infrastructure - Test terraform configuration and infrastructure setup"
            echo "  deployment     - Test deployment scripts and Docker configuration"
            echo "  backup         - Test backup and recovery procedures"
            echo "  monitoring     - Test monitoring and alerting configuration"
            echo "  integration    - Test end-to-end infrastructure integration"
            echo "  all           - Run all test suites (default)"
            exit 1
            ;;
    esac
    
    log "Infrastructure tests completed successfully! 🎉"
}

# Run main function
main "$@"