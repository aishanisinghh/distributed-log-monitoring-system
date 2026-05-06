pipeline {
    agent any

    environment {
        SONAR_PROJECT_KEY = 'distributed-log-monitoring'
        SONARQUBE_SERVER = 'SonarQube'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'SonarScanner'
                    withSonarQubeEnv("${SONARQUBE_SERVER}") {
                        sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectKey=${SONAR_PROJECT_KEY}"
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build & Test') {
            steps {
                sh 'docker compose build'
            }
        }

        stage('Deploy to Staging') {
            steps {
                sh 'docker compose up -d'
            }
        }
        
        stage('Deploy to AWS') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to AWS EC2...'
                sh './scripts/deploy.sh'
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
